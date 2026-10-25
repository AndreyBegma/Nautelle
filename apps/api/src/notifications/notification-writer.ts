import {
  type DeliverySkipReason,
  type EmailMode,
  effectiveProjectRole,
  emailModeFor,
  isEmailMode,
  kindAllowsChannel,
  NOTIFICATION_FOLD_WINDOW_MS,
  type NotificationKind,
  type Role,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { channelsFor, muteActive } from './notification-rules.service';

type Tx = Prisma.TransactionClient;

/** Someone a notification goes to, with their role where it applies. */
export interface Recipient {
  userId: string;
  role: Role;
}

export interface NotificationInput {
  kind: NotificationKind;
  projectId: string | null;
  runnerId: string | null;
  slot: string | null;
  issue: number | null;
  title: string;
  body: string;
  link: string | null;
  /** The event it came from; null for the runner watcher. */
  eventId: bigint | null;
  /** When it happened — the event's `ts`. */
  at: Date;
  /** D6 folding; off for the runner watcher, whose items are one per incident. */
  fold: boolean;
  /**
   * C-404: the creator of the card it is about — they get the kind's
   * `ownerEmail` when they never chose an email mode. Absent: no card.
   */
  ownerId?: string | null;
}

/** A row created or folded into — published once the transaction commits. */
export interface WrittenNotification {
  userId: string;
  notificationId: bigint;
}

const ACTIVE = 'active' as const;

/**
 * Recipients (D2), rules and mutes (D3), folding (D6) and the Telegram and
 * email delivery bookkeeping, inside the caller's transaction. Sending is not
 * here: a `pending` delivery is what the Telegram module or
 * `EmailDeliveryService` picks up, and a `digested` email waits for its
 * person's daily digest (C-404).
 */
@Injectable()
export class NotificationWriter {
  constructor(private readonly mail: MailService) {}

  /** D2: every active member of the project and every active admin. */
  async projectRecipients(tx: Tx, projectId: string): Promise<Recipient[]> {
    const [admins, members] = await Promise.all([
      tx.user.findMany({
        where: { role: 'admin', status: ACTIVE },
        select: { id: true },
      }),
      tx.projectMember.findMany({
        where: { projectId, user: { status: ACTIVE, role: { not: 'admin' } } },
        select: {
          roleOverride: true,
          user: { select: { id: true, role: true } },
        },
      }),
    ]);
    return [
      ...admins.map((a) => ({ userId: a.id, role: 'admin' as Role })),
      ...members.map((m) => ({
        userId: m.user.id,
        role: effectiveProjectRole(m.user.role, m.roleOverride),
      })),
    ];
  }

  /** D2: `runner.*` goes to active admins only. */
  async adminRecipients(tx: Tx): Promise<Recipient[]> {
    const admins = await tx.user.findMany({
      where: { role: 'admin', status: ACTIVE },
      select: { id: true },
    });
    return admins.map((a) => ({ userId: a.id, role: 'admin' }));
  }

  async write(
    tx: Tx,
    input: NotificationInput,
    recipients: Recipient[],
  ): Promise<WrittenNotification[]> {
    if (recipients.length === 0) return [];
    const userIds = recipients.map((r) => r.userId);
    const [rules, mutes, links] = await Promise.all([
      tx.notificationRule.findMany({
        where: { userId: { in: userIds }, kind: input.kind },
      }),
      input.projectId
        ? tx.notificationMute.findMany({
            where: { userId: { in: userIds }, projectId: input.projectId },
          })
        : Promise.resolve([]),
      tx.telegramLink.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true },
      }),
    ]);
    const ruleOf = new Map(rules.map((r) => [r.userId, r]));
    const muteOf = new Map(mutes.map((m) => [m.userId, m]));
    const linked = new Set(links.map((l) => l.userId));

    const written: WrittenNotification[] = [];
    for (const recipient of recipients) {
      const rule = ruleOf.get(recipient.userId);
      const channels = channelsFor(input.kind, recipient.role, rule);
      const email = this.emailMode(input, recipient.userId, rule?.email);
      if (!channels.inApp && !channels.telegram && email === 'off') continue;
      // A Telegram-only kind (C-372) is nothing to a user with no linked chat.
      if (
        !kindAllowsChannel(input.kind, 'inApp') &&
        !linked.has(recipient.userId)
      ) {
        continue;
      }
      const mute = muteOf.get(recipient.userId);
      const muted = mute !== undefined && muteActive(mute.until, input.at);

      const folded = input.fold
        ? await this.fold(tx, input, recipient.userId, channels.inApp)
        : null;
      if (folded === 'replay') continue;
      if (folded !== null) {
        written.push({ userId: recipient.userId, notificationId: folded });
        continue;
      }

      const [created] = await tx.notification.createManyAndReturn({
        data: [
          {
            userId: recipient.userId,
            kind: input.kind,
            projectId: input.projectId,
            runnerId: input.runnerId,
            slot: input.slot,
            issue: input.issue,
            title: input.title,
            body: input.body,
            link: input.link,
            eventId: input.eventId,
            lastEventId: input.eventId,
            firstAt: input.at,
            lastAt: input.at,
            muted,
            // In-app off, Telegram or email on: the row exists for its
            // delivery, read.
            readAt: channels.inApp ? null : input.at,
          },
        ],
        // A replayed event: the unique (eventId, userId, kind) already has it (D4).
        skipDuplicates: true,
        select: { id: true },
      });
      if (!created) continue;
      written.push({ userId: recipient.userId, notificationId: created.id });

      if (
        linked.has(recipient.userId) &&
        kindAllowsChannel(input.kind, 'telegram')
      ) {
        const skip: DeliverySkipReason | null = muted
          ? 'muted'
          : channels.telegram
            ? null
            : 'rule_off';
        await tx.notificationDelivery.create({
          data: {
            notificationId: created.id,
            userId: recipient.userId,
            channel: 'telegram',
            status: skip ? 'skipped' : 'pending',
            lastError: skip,
            nextAttemptAt: skip ? null : input.at,
          },
        });
      }
      if (email !== 'off') {
        await tx.notificationDelivery.create({
          data: {
            notificationId: created.id,
            userId: recipient.userId,
            channel: 'email',
            ...(muted
              ? {
                  status: 'skipped',
                  lastError: 'muted' satisfies DeliverySkipReason,
                }
              : email === 'immediate'
                ? { status: 'pending', nextAttemptAt: input.at }
                : { status: 'digested' }),
          },
        });
      }
    }
    return written;
  }

  /** C-404: what `userId` gets by email; always `off` without `SMTP_URL`. */
  private emailMode(
    input: NotificationInput,
    userId: string,
    stored: string | null | undefined,
  ): EmailMode {
    if (!this.mail.configured) return 'off';
    return emailModeFor(
      input.kind,
      stored && isEmailMode(stored) ? stored : null,
      input.ownerId === userId,
    );
  }

  /**
   * D6: the same `(user, kind, project, slot)` whose `firstAt` is within 15
   * minutes takes the event — `count + 1`, `lastAt`, and unread again. No
   * second delivery: Telegram heard about it with the first.
   *
   * `'replay'`: the event is already in that notification (`eventId` at or
   * below its `lastEventId` — the matcher goes in id order), so nothing changes.
   */
  private async fold(
    tx: Tx,
    input: NotificationInput,
    userId: string,
    inApp: boolean,
  ): Promise<bigint | 'replay' | null> {
    const existing = await tx.notification.findFirst({
      where: {
        userId,
        kind: input.kind,
        projectId: input.projectId,
        slot: input.slot,
        firstAt: {
          gt: new Date(input.at.getTime() - NOTIFICATION_FOLD_WINDOW_MS),
          lte: input.at,
        },
      },
      orderBy: { firstAt: 'desc' },
      select: { id: true, lastAt: true, lastEventId: true },
    });
    if (!existing) return null;
    if (
      input.eventId !== null &&
      existing.lastEventId !== null &&
      input.eventId <= existing.lastEventId
    ) {
      return 'replay';
    }
    await tx.notification.update({
      where: { id: existing.id },
      data: {
        count: { increment: 1 },
        lastEventId: input.eventId ?? existing.lastEventId,
        lastAt: existing.lastAt > input.at ? existing.lastAt : input.at,
        ...(inApp ? { readAt: null } : {}),
      },
    });
    return existing.id;
  }
}
