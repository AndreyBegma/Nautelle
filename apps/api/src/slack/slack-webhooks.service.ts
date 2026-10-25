import {
  isSlackEvent,
  isSlackWebhookUrl,
  SLACK_EVENTS,
  type SlackEvent,
  type SlackWebhookScope,
  type SlackWebhookStatus,
  type SlackWebhookUpdate,
} from '@nautelle/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { SlackWebhook } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { SecretCipher, SecretCipherError } from '../common/crypto';
import { PrismaService } from '../database/prisma.service';
import type { SlackPostResult } from './slack-client';
import { SlackDeliveryService } from './slack-delivery.service';
import {
  slackEncryptionMissing,
  slackNotConfigured,
  slackRejected,
  slackUnavailable,
  slackUrlInvalid,
  slackUrlRequired,
} from './slack-error';
import { slackTestText } from './slack-message';
import { SLACK_OPTIONS, type SlackOptions } from './slack-options';

/** A project's webhook, or the workspace one (`projectId` null). */
type Where = { projectId: string | null };

const HINT_LENGTH = 4;

/** The events in catalogue order, each once. */
const ordered = (events: readonly SlackEvent[]): SlackEvent[] =>
  SLACK_EVENTS.filter((e) => events.includes(e));

/**
 * The Slack webhooks of the settings (C-405, ADR-0109): one per project and
 * one for the workspace. The URL is sealed with `APP_ENCRYPTION_KEY` and
 * never leaves the API; reads show its last four characters.
 */
@Injectable()
export class SlackWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipher,
    private readonly audit: AuditService,
    private readonly delivery: SlackDeliveryService,
    @Inject(SLACK_OPTIONS) private readonly options: SlackOptions,
  ) {}

  async status(where: Where): Promise<SlackWebhookStatus> {
    const webhook = await this.find(where);
    const scope: SlackWebhookScope = where.projectId ? 'project' : 'workspace';
    const last = webhook
      ? await this.prisma.slackDelivery.findFirst({
          where: { webhookId: webhook.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            status: true,
            createdAt: true,
            lastAttemptAt: true,
            error: true,
          },
        })
      : null;
    const status: SlackWebhookStatus = {
      scope,
      configured: webhook !== null,
      urlHint: webhook ? `…${webhook.urlHint}` : null,
      events: webhook ? ordered(webhook.events.filter(isSlackEvent)) : [...SLACK_EVENTS],
      encryptionAvailable: this.cipher.available,
      updatedAt: webhook?.updatedAt.toISOString() ?? null,
      lastDelivery: last
        ? {
            status: last.status,
            at: (last.lastAttemptAt ?? last.createdAt).toISOString(),
            error: last.status === 'sent' ? null : last.error,
          }
        : null,
    };
    if (where.projectId) {
      status.workspaceFallback =
        webhook === null && (await this.find({ projectId: null })) !== null;
    }
    return status;
  }

  /**
   * Saves the webhook. The first save needs `url`; a later one without it
   * keeps the stored URL and changes the events only. 409 without the key.
   */
  async update(
    where: Where,
    input: SlackWebhookUpdate,
    actorId: string | null,
    ctx: AuditContext,
  ): Promise<SlackWebhookStatus> {
    const url = input.url?.trim() || null;
    if (url !== null && !isSlackWebhookUrl(url)) throw slackUrlInvalid();
    const existing = await this.find(where);
    if (!existing && url === null) throw slackUrlRequired();
    if (url !== null && !this.cipher.available) throw slackEncryptionMissing();
    const events = ordered(input.events);
    const sealed =
      url !== null
        ? {
            urlCiphertext: this.cipher.encrypt(url),
            urlHint: url.slice(-HINT_LENGTH),
          }
        : null;
    if (existing) {
      await this.prisma.slackWebhook.update({
        where: { id: existing.id },
        data: { ...sealed, events, updatedById: actorId },
      });
    } else if (sealed) {
      await this.prisma.slackWebhook.create({
        data: {
          ...sealed,
          projectId: where.projectId,
          events,
          updatedById: actorId,
        },
      });
    }
    await this.audit.record({
      ...ctx,
      action: 'slack.configure',
      ...this.target(where),
      ...(existing && {
        before: { events: ordered(existing.events.filter(isSlackEvent)) },
      }),
      // Never the URL: it is the webhook's secret.
      after: {
        scope: where.projectId ? 'project' : 'workspace',
        events,
        urlChanged: url !== null,
      },
      result: 'ok',
    });
    return this.status(where);
  }

  /** Removes the webhook and its queued messages. 404 when none is set. */
  async clear(where: Where, ctx: AuditContext): Promise<void> {
    const existing = await this.find(where);
    if (!existing) throw slackNotConfigured();
    await this.prisma.slackWebhook.delete({ where: { id: existing.id } });
    await this.audit.record({
      ...ctx,
      action: 'slack.clear',
      ...this.target(where),
      after: { scope: where.projectId ? 'project' : 'workspace' },
      result: 'ok',
    });
  }

  /** Posts a test message now; 502 with Slack's reason when it refuses. */
  async test(where: Where): Promise<void> {
    const webhook = await this.find(where);
    if (!webhook) throw slackNotConfigured();
    const project = where.projectId
      ? await this.prisma.project.findUnique({
          where: { id: where.projectId },
          select: { displayName: true },
        })
      : null;
    const text = slackTestText(
      where.projectId ? 'project' : 'workspace',
      project?.displayName ?? null,
      this.options.appUrl,
    );
    let result: SlackPostResult;
    try {
      result = await this.delivery.send(webhook.urlCiphertext, text);
    } catch (error) {
      if (error instanceof SecretCipherError) throw slackUnavailable();
      throw error;
    }
    if (!result.ok) {
      throw slackRejected(result.error ?? `HTTP ${result.status ?? '—'}`);
    }
  }

  private find(where: Where): Promise<SlackWebhook | null> {
    return where.projectId
      ? this.prisma.slackWebhook.findUnique({
          where: { projectId: where.projectId },
        })
      : this.prisma.slackWebhook.findFirst({ where: { projectId: null } });
  }

  private target(where: Where) {
    return where.projectId
      ? {
          target: { type: 'project', id: where.projectId },
          projectId: where.projectId,
        }
      : { target: { type: 'setting', id: 'slack.webhook' } };
  }
}
