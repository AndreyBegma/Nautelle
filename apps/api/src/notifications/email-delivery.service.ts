import { randomUUID } from 'node:crypto';
import { EMAIL_DIGEST_DEFAULTS } from '@nautelle/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  type MailMessage,
  MailSendError,
  MailService,
} from '../mail/mail.service';
import { MAIL_OPTIONS, type MailOptions } from '../mail/mail-options';
import {
  calendarDate,
  digestOccurrence,
  formatEmail,
  formatEmailDigest,
} from './email-message';
import {
  CONTENT_SELECT,
  type DeliveryContent,
  toContent,
} from './telegram-delivery-ledger';

type Tx = Prisma.TransactionClient;

const JOB_NAME = 'notification-email-delivery';
const LOCK_KEY = 'notifications:email-ledger';
/** A claimed email is not handed out again for this long unless reported. */
export const EMAIL_CLAIM_LEASE_MS = 60_000;
/** Attempts before an email is `failed` for good. */
export const EMAIL_MAX_ATTEMPTS = 5;
/** Backoff between attempts: 30 s, 1 min, 2 min, … */
const BACKOFF_BASE_MS = 30_000;
/** Emails a pass sends at most; the rest wait for the next one. */
const BATCH = 50;
const LAST_ERROR_MAX = 500;
/** Why a row of an account that is no longer active was never sent. */
export const EMAIL_ACCOUNT_INACTIVE = 'The account is not active';

/** What one pass did; the e2e suites assert on it. */
export interface EmailPass {
  sent: number;
  failed: number;
  digests: number;
}

interface ClaimedEmail {
  id: string;
  to: string;
  content: DeliveryContent;
}

interface ClaimedEmailDigest {
  digestId: string;
  userId: string;
  to: string;
  /** The occurrence it is for — stored as `lastDigestAt` once it is sent. */
  occurrence: Date;
  date: string;
  items: DeliveryContent[];
}

/** A delivery's notification, with what its email needs about the recipient. */
const EMAIL_SELECT = {
  ...CONTENT_SELECT,
  user: { select: { email: true, status: true } },
} as const;

const clip = (error: string): string => error.slice(0, LAST_ERROR_MAX);

const reasonOf = (error: unknown): { message: string; permanent: boolean } =>
  error instanceof MailSendError
    ? { message: error.message, permanent: error.permanent }
    : // Not the server's answer: a bug here. Never its text — it could hold anything.
      { message: 'internal error while sending', permanent: false };

/**
 * The email side of `notification_deliveries` (C-404, ADR-0108). An
 * `immediate` email is a `pending` row, sent on the next pass. A `digest` one
 * is `digested` from the start and waits for its person's daily digest: at
 * their time in their zone, everything written up to it goes out as one email,
 * once per occurrence (`notification_email_settings.lastDigestAt`).
 *
 * Claims run under an advisory lock and lease their rows for
 * `EMAIL_CLAIM_LEASE_MS`, so two API instances never send the same email
 * twice inside the lease. Without `SMTP_URL` the writer creates no email rows
 * and a pass does nothing.
 */
@Injectable()
export class EmailDeliveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EmailDeliveryService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MAIL_OPTIONS) private readonly options: MailOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.autoStart || !this.mail.configured) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
    this.scheduler.addInterval(JOB_NAME, this.timer);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    if (this.scheduler.doesExist('interval', JOB_NAME)) {
      this.scheduler.deleteInterval(JOB_NAME);
    }
  }

  /** One pass: every due email, then every due digest. */
  async deliverOnce(now = new Date()): Promise<EmailPass> {
    const pass: EmailPass = { sent: 0, failed: 0, digests: 0 };
    if (!this.mail.configured) return pass;
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
      return {
        messages: await this.claimMessages(tx, now),
        digests: await this.claimDigests(tx, now),
      };
    });

    for (const message of claim.messages) {
      const sent = await this.send({
        to: message.to,
        ...formatEmail(message.content, this.mail.appUrl),
      });
      if (sent === null) {
        await this.markSent([message.id], now);
        pass.sent += 1;
      } else {
        this.logger.warn(
          `email delivery ${message.id} failed: ${sent.message}`,
        );
        await this.markFailed([message.id], sent, now);
        pass.failed += 1;
      }
    }

    for (const digest of claim.digests) {
      const sent = await this.send({
        to: digest.to,
        ...formatEmailDigest(digest.items, this.mail.appUrl, digest.date),
      });
      const ids = {
        digestId: digest.digestId,
        status: 'digested',
        sentAt: null,
      } as const;
      if (sent === null) {
        await this.prisma.$transaction([
          this.prisma.notificationDelivery.updateMany({
            where: ids,
            data: {
              sentAt: now,
              nextAttemptAt: null,
              lastError: null,
              attempts: { increment: 1 },
            },
          }),
          this.prisma.notificationEmailSettings.upsert({
            where: { userId: digest.userId },
            create: { userId: digest.userId, lastDigestAt: digest.occurrence },
            update: { lastDigestAt: digest.occurrence },
          }),
        ]);
        pass.digests += 1;
      } else {
        this.logger.warn(
          `email digest ${digest.digestId} failed: ${sent.message}`,
        );
        const rows = await this.prisma.notificationDelivery.findMany({
          where: ids,
          select: { id: true },
        });
        await this.markFailed(
          rows.map((r) => r.id),
          sent,
          now,
          'digested',
        );
        pass.failed += 1;
      }
    }
    return pass;
  }

  /** null when it went out; why not, otherwise. */
  private async send(
    message: MailMessage,
  ): Promise<{ message: string; permanent: boolean } | null> {
    try {
      await this.mail.send(message);
      return null;
    } catch (error) {
      return reasonOf(error);
    }
  }

  private async markSent(ids: string[], now: Date): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'sent',
        sentAt: now,
        nextAttemptAt: null,
        lastError: null,
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * A send that did not go through: retried with backoff until
   * `EMAIL_MAX_ATTEMPTS`, or never when the server refused it for good. A
   * digest's rows stay `digested` while they are retried.
   */
  private async markFailed(
    ids: string[],
    reason: { message: string; permanent: boolean },
    now: Date,
    retryStatus: 'pending' | 'digested' = 'pending',
  ): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { id: { in: ids } },
      select: { attempts: true },
    });
    const attempts = Math.max(0, ...rows.map((r) => r.attempts)) + 1;
    const giveUp = reason.permanent || attempts >= EMAIL_MAX_ATTEMPTS;
    await this.prisma.notificationDelivery.updateMany({
      where: { id: { in: ids } },
      data: {
        attempts,
        lastError: clip(reason.message),
        status: giveUp ? 'failed' : retryStatus,
        nextAttemptAt: giveUp
          ? null
          : new Date(now.getTime() + BACKOFF_BASE_MS * 2 ** (attempts - 1)),
      },
    });
  }

  private async claimMessages(tx: Tx, now: Date): Promise<ClaimedEmail[]> {
    const due = await tx.notificationDelivery.findMany({
      where: {
        channel: 'email',
        status: 'pending',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
      select: { id: true, notification: { select: EMAIL_SELECT } },
    });
    const inactive = due.filter((d) => d.notification.user.status !== 'active');
    if (inactive.length > 0) {
      await tx.notificationDelivery.updateMany({
        where: { id: { in: inactive.map((d) => d.id) } },
        data: {
          status: 'failed',
          lastError: EMAIL_ACCOUNT_INACTIVE,
          nextAttemptAt: null,
        },
      });
    }
    const claimed = due.filter((d) => d.notification.user.status === 'active');
    if (claimed.length > 0) {
      await tx.notificationDelivery.updateMany({
        where: { id: { in: claimed.map((d) => d.id) } },
        data: { nextAttemptAt: new Date(now.getTime() + EMAIL_CLAIM_LEASE_MS) },
      });
    }
    return claimed.map((d) => ({
      id: d.id,
      to: d.notification.user.email,
      content: toContent(d.notification),
    }));
  }

  private async claimDigests(tx: Tx, now: Date): Promise<ClaimedEmailDigest[]> {
    const waiting = await tx.notificationDelivery.findMany({
      where: {
        channel: 'email',
        status: 'digested',
        sentAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        userId: true,
        createdAt: true,
        notification: { select: EMAIL_SELECT },
      },
    });
    const settingsOf = new Map(
      (
        await tx.notificationEmailSettings.findMany({
          where: { userId: { in: [...new Set(waiting.map((r) => r.userId))] } },
          select: {
            userId: true,
            digestTime: true,
            timezone: true,
            lastDigestAt: true,
          },
        })
      ).map((s) => [s.userId, s]),
    );
    const byUser = new Map<string, typeof waiting>();
    for (const row of waiting) {
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    }

    const leaseUntil = new Date(now.getTime() + EMAIL_CLAIM_LEASE_MS);
    const digests: ClaimedEmailDigest[] = [];
    for (const [userId, rows] of byUser) {
      const user = rows[0].notification.user;
      const settings = settingsOf.get(userId);
      const timezone = settings?.timezone ?? EMAIL_DIGEST_DEFAULTS.timezone;
      const occurrence = digestOccurrence(
        now,
        settings?.digestTime ?? EMAIL_DIGEST_DEFAULTS.digestTime,
        timezone,
      );
      // Once per occurrence; what came after it waits for the next one.
      if (settings?.lastDigestAt && settings.lastDigestAt >= occurrence) {
        continue;
      }
      const due = rows.filter((r) => r.createdAt <= occurrence);
      if (due.length === 0) continue;
      const ids = due.map((r) => r.id);
      if (user.status !== 'active') {
        await tx.notificationDelivery.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'failed',
            lastError: EMAIL_ACCOUNT_INACTIVE,
            nextAttemptAt: null,
          },
        });
        continue;
      }
      const digestId = randomUUID();
      await tx.notificationDelivery.updateMany({
        where: { id: { in: ids } },
        data: { digestId, nextAttemptAt: leaseUntil },
      });
      digests.push({
        digestId,
        userId,
        to: user.email,
        occurrence,
        date: calendarDate(occurrence, timezone),
        items: due.map((r) => toContent(r.notification)),
      });
    }
    return digests;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.deliverOnce();
    } catch (error) {
      this.logger.error(
        `email delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
