import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SecretCipher } from '../common/crypto';
import { PrismaService } from '../database/prisma.service';
import { SlackClient, type SlackPostResult } from './slack-client';
import { slackAfterAttempt } from './slack-delivery-policy';
import { type SlackMessageParts, slackText } from './slack-message';
import { SLACK_OPTIONS, type SlackOptions } from './slack-options';

const JOB_NAME = 'slack-delivery-worker';
/** Deliveries one pass claims. */
const CLAIM_BATCH = 20;
/** A claimed delivery waits this far past the request timeout before a retry. */
const CLAIM_LEASE_EXTRA_MS = 60_000;
/** The longest `error` kept. */
const ERROR_MAX = 200;

/**
 * Sends the queued Slack messages (C-405, ADR-0109). Every pass claims due
 * `pending` deliveries with `FOR UPDATE SKIP LOCKED`, pushes their
 * `nextAttemptAt` past a lease — so two API instances never send one twice
 * and a worker that dies mid-send leaves it to be retried — and then posts
 * them oldest first, one at a time, so a channel reads in order.
 */
@Injectable()
export class SlackDeliveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SlackDeliveryService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipher,
    private readonly client: SlackClient,
    private readonly scheduler: SchedulerRegistry,
    @Inject(SLACK_OPTIONS) private readonly options: SlackOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.workerEnabled) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`slack delivery tick failed: ${reason}`);
      });
    }, this.options.intervalMs);
    this.timer.unref();
    this.scheduler.addInterval(JOB_NAME, this.timer);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    if (this.scheduler.doesExist('interval', JOB_NAME)) {
      this.scheduler.deleteInterval(JOB_NAME);
    }
  }

  /**
   * One pass: claims what is due and attempts each once. Returns how many it
   * attempted; `null` while a pass is running. Tests call it directly.
   */
  async tick(now = new Date()): Promise<number | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const claimed = await this.claim(now);
      for (const id of claimed) {
        await this.deliver(id, now).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`slack delivery ${id} failed: ${reason}`);
        });
      }
      return claimed.length;
    } finally {
      this.running = false;
    }
  }

  /** Posts one message now, outside the queue — the settings' test send. */
  async send(urlCiphertext: string, text: string): Promise<SlackPostResult> {
    return this.client.post(this.cipher.decrypt(urlCiphertext), text);
  }

  private claim(now: Date): Promise<string[]> {
    const lease = new Date(
      now.getTime() + this.options.timeoutMs + CLAIM_LEASE_EXTRA_MS,
    );
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM slack_deliveries
         WHERE status = 'pending' AND "nextAttemptAt" <= ${now}
         ORDER BY "createdAt", id
         LIMIT ${CLAIM_BATCH}
           FOR UPDATE SKIP LOCKED`;
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        await tx.slackDelivery.updateMany({
          where: { id: { in: ids } },
          data: { nextAttemptAt: lease },
        });
      }
      return ids;
    });
  }

  private async deliver(id: string, now: Date): Promise<void> {
    const delivery = await this.prisma.slackDelivery.findUnique({
      where: { id },
      include: { webhook: { select: { urlCiphertext: true } } },
    });
    if (!delivery || delivery.status !== 'pending') return;
    let result: SlackPostResult;
    try {
      const text = slackText(
        delivery.message as unknown as SlackMessageParts,
        this.options.appUrl,
      );
      result = await this.send(delivery.webhook.urlCiphertext, text);
    } catch {
      // The URL cannot be opened: no key, or another key. A person fixes
      // that, not a retry — but the message is kept for the next attempts.
      result = {
        ok: false,
        status: null,
        error: 'url_unavailable',
        retryAfterMs: null,
      };
    }
    const attempts = delivery.attempts + 1;
    const next = slackAfterAttempt(result, attempts, now);
    await this.prisma.slackDelivery.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: next.status,
        nextAttemptAt: next.nextAttemptAt,
        attempts,
        lastAttemptAt: now,
        responseCode: result.status,
        error: result.error?.slice(0, ERROR_MAX) ?? null,
      },
    });
    if (next.status === 'failed') {
      this.logger.warn(
        `slack delivery ${id} given up after ${attempts} attempts: ${result.error ?? result.status}`,
      );
    }
  }
}
