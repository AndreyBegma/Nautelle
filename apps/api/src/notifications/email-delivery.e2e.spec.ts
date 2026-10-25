import {
  CARD_FINISHED_EVENT,
  CARD_WAITING_EVENT,
  type EmailIntegrationStatus,
  type NotificationEmailView,
  type NotificationRulesView,
} from '@nautelle/shared';
import { FakeSmtpServer } from '../mail/testing/fake-smtp';
import { login, type Session } from '../test/e2e-app';
import { EmailDeliveryService } from './email-delivery.service';
import { NotificationMatcher } from './notification-matcher';
import {
  createNotificationsApp,
  insertEvent,
  type NotificationsE2e,
  resetNotifications,
  seedRunnerProject,
  seedUser,
} from './testing/notifications-e2e';

const APP_URL = 'https://nautelle.example.com';
const SMTP_USER = 'mailer@example.com';
const SMTP_PASSWORD = 'very-secret-smtp-password';
const HOUR_MS = 3_600_000;

describe('email notifications over SMTP (C-404, e2e)', () => {
  const smtp = new FakeSmtpServer();
  let ctx: NotificationsE2e;
  let matcher: NotificationMatcher;
  let delivery: EmailDeliveryService;
  let runnerId: string;
  let projectId: string;
  let cardNumber = 0;

  const signIn = async (
    email: string,
    role: 'admin' | 'operator' | 'viewer',
  ): Promise<{ id: string; session: Session }> => {
    const user = await seedUser(ctx.prisma, email, role, projectId);
    return { id: user.id, session: await login(ctx, email) };
  };

  /** A board card created by `createdById`. */
  const card = async (createdById: string, title = 'Add login') => {
    cardNumber += 1;
    await ctx.prisma.boardCard.create({
      data: {
        projectId,
        number: cardNumber,
        shortId: `card${String(cardNumber).padStart(4, '0')}`,
        title,
        position: cardNumber,
        issueOnRun: false,
        specOnRun: false,
        column: 'in_progress',
        movedAt: new Date(),
        createdById,
      },
    });
    return cardNumber;
  };

  const event = async (
    type: typeof CARD_WAITING_EVENT | typeof CARD_FINISHED_EVENT,
    number: number,
    title = 'Add login',
    ts?: Date,
  ) => {
    await insertEvent(ctx.prisma, runnerId, {
      type,
      ts,
      source: 'api',
      slot: null,
      issue: null,
      data:
        type === CARD_WAITING_EVENT
          ? { number, title, round: 1, reason: 'question' }
          : { number, title, prNumber: 42 },
    });
    await matcher.tick();
  };

  const emailRows = () =>
    ctx.prisma.notificationDelivery.findMany({
      where: { channel: 'email' },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        status: true,
        lastError: true,
        sentAt: true,
        attempts: true,
      },
    });

  /** The SMTP error Admin › Integrations › Email shows. */
  const lastSmtpError = async (): Promise<string | null> => {
    const admin = await signIn('root@example.com', 'admin');
    const status = (
      await admin.session.get('/admin/integrations/email').expect(200)
    ).body as EmailIntegrationStatus;
    return status.lastError;
  };

  beforeAll(async () => {
    await smtp.start();
    ctx = await createNotificationsApp(undefined, undefined, {
      smtpUrl: smtp.url({ user: SMTP_USER, password: SMTP_PASSWORD }),
      from: 'Nautelle <nautelle@example.com>',
      appUrl: APP_URL,
    });
    matcher = ctx.app.get(NotificationMatcher);
    delivery = ctx.app.get(EmailDeliveryService);
  });
  afterAll(async () => {
    await ctx.app.close();
    await smtp.stop();
  });

  beforeEach(async () => {
    smtp.clear();
    cardNumber = 0;
    await resetNotifications(ctx.prisma);
    ({ runnerId, projectId } = await seedRunnerProject(ctx.prisma));
    expect(await matcher.tick()).toBe(0);
  });

  describe('a waiting question', () => {
    it('emails the card owner at once, and nobody else by default', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await signIn('bob@example.com', 'operator');
      const number = await card(ada.id);

      await event(CARD_WAITING_EVENT, number);
      expect(await emailRows()).toEqual([
        expect.objectContaining({ userId: ada.id, status: 'pending' }),
      ]);
      expect(await delivery.deliverOnce()).toEqual({
        sent: 1,
        failed: 0,
        digests: 0,
      });

      expect(smtp.messages).toHaveLength(1);
      const [mail] = smtp.messages;
      expect(mail.from).toBe('nautelle@example.com');
      expect(mail.to).toEqual(['ada@example.com']);
      expect(mail.subject).toBe(
        '[Nautelle] C-1 "Add login" is waiting for you — widget',
      );
      expect(mail.body).toContain(
        `${APP_URL}/projects/${projectId}/board?card=1`,
      );
      expect(mail.body).toContain(`${APP_URL}/account/notifications`);
      expect(await emailRows()).toEqual([
        expect.objectContaining({ status: 'sent', attempts: 1 }),
      ]);
      // Sent once: the next pass has nothing to do.
      expect(await delivery.deliverOnce()).toEqual({
        sent: 0,
        failed: 0,
        digests: 0,
      });
    });

    it('emails anyone who opts in, and nobody who turned it off', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      const bob = await signIn('bob@example.com', 'operator');
      await bob.session
        .send('put', '/notifications/rules', {
          rules: [
            {
              kind: 'card.waiting',
              inApp: true,
              telegram: false,
              email: 'immediate',
            },
          ],
        })
        .expect(200);
      await ada.session
        .send('put', '/notifications/rules', {
          rules: [
            {
              kind: 'card.waiting',
              inApp: true,
              telegram: false,
              email: 'off',
            },
          ],
        })
        .expect(200);

      await event(CARD_WAITING_EVENT, await card(ada.id));
      await delivery.deliverOnce();
      expect(smtp.messages.map((m) => m.to)).toEqual([['bob@example.com']]);
    });

    it('is not emailed while the project is muted', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await ada.session
        .send('put', `/notifications/mutes/${projectId}`, {})
        .expect(200);

      await event(CARD_WAITING_EVENT, await card(ada.id));
      expect(await emailRows()).toEqual([
        expect.objectContaining({ status: 'skipped', lastError: 'muted' }),
      ]);
      await delivery.deliverOnce();
      expect(smtp.messages).toHaveLength(0);
      // A muted email never reached the server: it is no SMTP error.
      expect(await lastSmtpError()).toBeNull();
    });

    it('is not emailed to an account that is no longer active', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await event(CARD_WAITING_EVENT, await card(ada.id));
      await ctx.prisma.user.update({
        where: { id: ada.id },
        data: { status: 'disabled' },
      });

      await delivery.deliverOnce();
      expect(smtp.messages).toHaveLength(0);
      expect(await emailRows()).toEqual([
        expect.objectContaining({ status: 'failed', attempts: 0 }),
      ]);
      expect(await lastSmtpError()).toBeNull();
    });

    it('retries a refused send, then gives up on a permanent refusal', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await event(CARD_WAITING_EVENT, await card(ada.id));

      smtp.reply = `451 4.3.0 try again, ${SMTP_PASSWORD}`;
      const now = new Date();
      expect(await delivery.deliverOnce(now)).toMatchObject({ failed: 1 });
      const [retry] = await emailRows();
      expect(retry).toMatchObject({ status: 'pending', attempts: 1 });
      // The server's answer is kept, never the credentials in SMTP_URL.
      expect(retry.lastError).toContain('451');
      expect(retry.lastError).not.toContain(SMTP_PASSWORD);
      // Not again before its backoff.
      expect(await delivery.deliverOnce(now)).toMatchObject({ failed: 0 });

      smtp.reply = '550 5.1.1 no such user';
      expect(
        await delivery.deliverOnce(new Date(now.getTime() + HOUR_MS)),
      ).toMatchObject({ failed: 1 });
      expect(await emailRows()).toEqual([
        expect.objectContaining({ status: 'failed', attempts: 2 }),
      ]);
      expect(smtp.messages).toHaveLength(0);
      expect(await lastSmtpError()).toContain('550');
    });
  });

  describe('the daily digest', () => {
    it('arrives once a day with what waits on you and what was done', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await ada.session
        .send('put', '/notifications/rules', {
          rules: [
            {
              kind: 'card.waiting',
              inApp: true,
              telegram: false,
              email: 'digest',
            },
          ],
        })
        .expect(200);
      // card.finished goes to its owner's digest by default.
      await event(CARD_FINISHED_EVENT, await card(ada.id), 'Add login');
      await event(
        CARD_WAITING_EVENT,
        await card(ada.id, 'Add logout'),
        'Add logout',
      );
      expect(await emailRows()).toEqual([
        expect.objectContaining({ status: 'digested', sentAt: null }),
        expect.objectContaining({ status: 'digested', sentAt: null }),
      ]);
      const written = new Date();

      // Before the next 09:00 UTC nothing goes out: it is for that digest.
      expect(await delivery.deliverOnce(written)).toMatchObject({ digests: 0 });
      expect(smtp.messages).toHaveLength(0);

      // A day later its time has passed: one email with both.
      const dayOne = new Date(written.getTime() + 25 * HOUR_MS);
      expect(await delivery.deliverOnce(dayOne)).toEqual({
        sent: 0,
        failed: 0,
        digests: 1,
      });
      expect(smtp.messages).toHaveLength(1);
      const [digest] = smtp.messages;
      expect(digest.to).toEqual(['ada@example.com']);
      expect(digest.subject).toBe('[Nautelle] Daily digest: 1 waiting on you');
      expect(digest.body).toContain('Waiting on you (1)');
      expect(digest.body).toContain('C-2 "Add logout" is waiting for you');
      expect(digest.body).toContain('Done (1)');
      expect(digest.body).toContain('C-1 "Add login" is finished');
      expect(
        (await emailRows()).every(
          (r) => r.sentAt?.getTime() === dayOne.getTime(),
        ),
      ).toBe(true);

      // The same day, a new item waits for tomorrow's digest. It comes past
      // the fold window, so it is a notification of its own, not C-1's.
      await event(
        CARD_FINISHED_EVENT,
        await card(ada.id, 'Add signup'),
        'Add signup',
        new Date(written.getTime() + 20 * 60_000),
      );
      expect(
        await delivery.deliverOnce(new Date(dayOne.getTime() + 60_000)),
      ).toMatchObject({ digests: 0 });
      expect(smtp.messages).toHaveLength(1);

      const dayTwo = new Date(written.getTime() + 49 * HOUR_MS);
      expect(await delivery.deliverOnce(dayTwo)).toMatchObject({ digests: 1 });
      expect(smtp.messages).toHaveLength(2);
      expect(smtp.messages[1].subject).toBe(
        '[Nautelle] Daily digest: 1 update',
      );
      expect(smtp.messages[1].body).toContain('C-3 "Add signup" is finished');
      expect(smtp.messages[1].body).not.toContain('Add logout');
    });

    it('is not sent when nothing waits for it', async () => {
      await signIn('ada@example.com', 'operator');
      expect(
        await delivery.deliverOnce(new Date(Date.now() + 25 * HOUR_MS)),
      ).toMatchObject({ digests: 0 });
      expect(smtp.messages).toHaveLength(0);
    });

    it("goes out at the person's own time and zone", async () => {
      const ada = await signIn('ada@example.com', 'operator');
      const settings = (
        await ada.session
          .send('put', '/notifications/email', {
            digestTime: '18:30',
            timezone: 'Europe/Kyiv',
          })
          .expect(200)
      ).body as NotificationEmailView;
      expect(settings).toEqual({
        digestTime: '18:30',
        timezone: 'Europe/Kyiv',
        configured: true,
        address: 'ada@example.com',
      });
      await event(CARD_FINISHED_EVENT, await card(ada.id));
      // Push the row back so the test does not depend on the clock.
      await ctx.prisma.notificationDelivery.updateMany({
        where: { channel: 'email' },
        data: { createdAt: new Date('2026-10-20T10:00:00Z') },
      });

      // 18:30 in Kyiv on 20 October (EEST, UTC+3) is 15:30 UTC.
      expect(
        await delivery.deliverOnce(new Date('2026-10-20T15:29:00Z')),
      ).toMatchObject({ digests: 0 });
      expect(
        await delivery.deliverOnce(new Date('2026-10-20T15:31:00Z')),
      ).toMatchObject({ digests: 1 });
      expect(smtp.messages[0].body).toContain(
        'Your Nautelle digest for 2026-10-20',
      );
    });
  });

  describe('settings API', () => {
    it('shows the email mode, its default and whether a kind can be emailed', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      const view = (await ada.session.get('/notifications/rules').expect(200))
        .body as NotificationRulesView;
      const rule = (kind: string) => view.rules.find((r) => r.kind === kind);
      expect(rule('card.waiting')).toMatchObject({
        email: null,
        emailable: true,
        ownerEmail: 'immediate',
      });
      expect(rule('card.finished')).toMatchObject({ ownerEmail: 'digest' });
      expect(rule('card.demo')).toMatchObject({
        emailable: false,
        ownerEmail: null,
      });

      await ada.session
        .send('put', '/notifications/rules', {
          rules: [
            {
              kind: 'card.waiting',
              inApp: true,
              telegram: false,
              email: 'digest',
            },
          ],
        })
        .expect(200);
      // Leaving `email` out keeps it.
      await ada.session
        .send('put', '/notifications/rules', {
          rules: [{ kind: 'card.waiting', inApp: false, telegram: false }],
        })
        .expect(200);
      const after = (await ada.session.get('/notifications/rules').expect(200))
        .body as NotificationRulesView;
      expect(after.rules.find((r) => r.kind === 'card.waiting')).toMatchObject({
        inApp: false,
        email: 'digest',
      });
    });

    it('rejects an unknown mode, and email for a kind that is never emailed', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      for (const rule of [
        { kind: 'card.waiting', inApp: true, telegram: false, email: 'hourly' },
        {
          kind: 'card.demo',
          inApp: true,
          telegram: false,
          email: 'immediate',
        },
      ]) {
        await ada.session
          .send('put', '/notifications/rules', { rules: [rule] })
          .expect(400);
      }
    });

    it('validates the digest time and zone', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      expect(
        (await ada.session.get('/notifications/email').expect(200)).body,
      ).toEqual({
        digestTime: '09:00',
        timezone: 'UTC',
        configured: true,
        address: 'ada@example.com',
      });
      for (const body of [
        { digestTime: '25:00', timezone: 'UTC' },
        { digestTime: '09:00', timezone: 'Mars/Olympus' },
        { digestTime: '09:00' },
      ]) {
        await ada.session.send('put', '/notifications/email', body).expect(400);
      }
    });
  });

  describe('Admin › Integrations › Email', () => {
    it('shows the server without its credentials', async () => {
      const admin = await signIn('root@example.com', 'admin');
      const status = (
        await admin.session.get('/admin/integrations/email').expect(200)
      ).body as EmailIntegrationStatus;
      expect(status).toEqual({
        configured: true,
        server: `127.0.0.1:${smtp.port}`,
        secure: false,
        from: 'Nautelle <nautelle@example.com>',
        links: true,
        pending: 0,
        lastError: null,
        lastSentAt: null,
      });
      expect(JSON.stringify(status)).not.toContain(SMTP_PASSWORD);
    });

    it('sends a test email to the admin', async () => {
      const admin = await signIn('root@example.com', 'admin');
      await admin.session
        .send('post', '/admin/integrations/email/test')
        .expect(204);
      expect(smtp.messages).toHaveLength(1);
      expect(smtp.messages[0]).toMatchObject({
        to: ['root@example.com'],
        subject: '[Nautelle] Test email',
      });
    });

    it('reports a refused test send without the credentials', async () => {
      const admin = await signIn('root@example.com', 'admin');
      smtp.reply = `550 5.7.1 ${SMTP_USER} may not send`;
      const response = await admin.session
        .send('post', '/admin/integrations/email/test')
        .expect(502);
      expect(response.body.error).toBe('email_unavailable');
      expect(response.text).toContain('550');
      expect(response.text).not.toContain(SMTP_USER);
      expect(response.text).not.toContain(SMTP_PASSWORD);
    });

    it('is for admins only', async () => {
      const ada = await signIn('ada@example.com', 'operator');
      await ada.session.get('/admin/integrations/email').expect(403);
      await ada.session
        .send('post', '/admin/integrations/email/test')
        .expect(403);
      expect(smtp.messages).toHaveLength(0);
    });
  });
});

describe('email notifications without SMTP_URL (C-404, e2e)', () => {
  let ctx: NotificationsE2e;

  beforeAll(async () => {
    ctx = await createNotificationsApp();
  });
  afterAll(() => ctx.app.close());

  it('writes no email rows and refuses the test send', async () => {
    await resetNotifications(ctx.prisma);
    const { runnerId, projectId } = await seedRunnerProject(ctx.prisma);
    const matcher = ctx.app.get(NotificationMatcher);
    expect(await matcher.tick()).toBe(0);
    const admin = await seedUser(
      ctx.prisma,
      'root@example.com',
      'admin',
      projectId,
    );
    await ctx.prisma.boardCard.create({
      data: {
        projectId,
        number: 1,
        shortId: 'card0001',
        title: 'Add login',
        position: 1,
        issueOnRun: false,
        specOnRun: false,
        column: 'in_progress',
        movedAt: new Date(),
        createdById: admin.id,
      },
    });
    await insertEvent(ctx.prisma, runnerId, {
      type: CARD_WAITING_EVENT,
      source: 'api',
      slot: null,
      issue: null,
      data: { number: 1, title: 'Add login', round: 1, reason: 'question' },
    });
    expect(await matcher.tick()).toBeGreaterThan(0);
    expect(
      await ctx.prisma.notificationDelivery.count({
        where: { channel: 'email' },
      }),
    ).toBe(0);

    const session = await login(ctx, 'root@example.com');
    expect(
      (await session.get('/admin/integrations/email').expect(200)).body,
    ).toMatchObject({ configured: false, server: null });
    expect(
      (await session.get('/notifications/email').expect(200)).body,
    ).toMatchObject({ configured: false });
    const refused = await session
      .send('post', '/admin/integrations/email/test')
      .expect(409);
    expect(refused.body.error).toBe('email_not_configured');
  });
});
