import {
  EMAIL_DIGEST_DEFAULTS,
  type EmailIntegrationStatus,
  type NotificationEmailSettings,
  type NotificationEmailView,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit';
import type { AuditContext } from '../audit/audit.types';
import type { AuthUser } from '../auth';
import { PrismaService } from '../database/prisma.service';
import { MailSendError, MailService } from '../mail/mail.service';
import { EMAIL_ACCOUNT_INACTIVE } from './email-delivery.service';
import { notificationError } from './notification-error';

const TEST_SUBJECT = '[Nautelle] Test email';
const TEST_TEXT =
  'This is a test email from Nautelle. Email notifications can reach you.';

const emailNotConfigured = () =>
  notificationError(
    409,
    'email_not_configured',
    'SMTP_URL is not set; email notifications are off',
  );

/**
 * Email delivery settings (C-404, ADR-0108): each person's digest time, and
 * the admin view of the SMTP server with its test send. The server comes from
 * `SMTP_URL` only — it is never stored, and its credentials never leave the
 * API.
 */
@Injectable()
export class NotificationEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async settings(user: Pick<AuthUser, 'id'>): Promise<NotificationEmailView> {
    const [account, row] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { email: true },
      }),
      this.prisma.notificationEmailSettings.findUnique({
        where: { userId: user.id },
        select: { digestTime: true, timezone: true },
      }),
    ]);
    return {
      ...(row ?? EMAIL_DIGEST_DEFAULTS),
      configured: this.mail.configured,
      address: account.email,
    };
  }

  async setSettings(
    user: Pick<AuthUser, 'id'>,
    update: NotificationEmailSettings,
    ctx: AuditContext,
  ): Promise<NotificationEmailView> {
    const before = await this.settings(user);
    await this.prisma.notificationEmailSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...update },
      update,
    });
    await this.audit.record({
      ...ctx,
      action: 'notification.email',
      target: { type: 'user', id: user.id },
      before: { digestTime: before.digestTime, timezone: before.timezone },
      after: { ...update },
      result: 'ok',
    });
    return this.settings(user);
  }

  async status(): Promise<EmailIntegrationStatus> {
    const server = this.mail.server();
    const [pending, failed, sent] = await Promise.all([
      this.prisma.notificationDelivery.count({
        where: {
          channel: 'email',
          OR: [{ status: 'pending' }, { status: 'digested', sentAt: null }],
        },
      }),
      // Only a send the SMTP server refused: a muted (`skipped`) row or one
      // of an inactive account carries a reason too, but never reached it.
      this.prisma.notificationDelivery.findFirst({
        where: {
          channel: 'email',
          status: { in: ['pending', 'digested', 'failed'] },
          attempts: { gt: 0 },
          sentAt: null,
          AND: [
            { lastError: { not: null } },
            { lastError: { not: EMAIL_ACCOUNT_INACTIVE } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { lastError: true },
      }),
      this.prisma.notificationDelivery.findFirst({
        where: { channel: 'email', sentAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
    ]);
    return {
      configured: server !== null,
      server: server?.server ?? null,
      secure: server?.secure ?? false,
      from: this.mail.from,
      links: this.mail.appUrl !== null,
      pending,
      lastError: failed?.lastError ?? null,
      lastSentAt: sent?.sentAt?.toISOString() ?? null,
    };
  }

  /** Sends a test email to the admin's own address. */
  async sendTest(admin: Pick<AuthUser, 'id'>): Promise<void> {
    if (!this.mail.configured) throw emailNotConfigured();
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
      select: { email: true },
    });
    try {
      await this.mail.send({
        to: account.email,
        subject: TEST_SUBJECT,
        text: TEST_TEXT,
      });
    } catch (error) {
      throw notificationError(
        502,
        'email_unavailable',
        error instanceof MailSendError
          ? `The SMTP server did not take the email: ${error.message}`
          : 'The SMTP server did not take the email',
      );
    }
  }
}
