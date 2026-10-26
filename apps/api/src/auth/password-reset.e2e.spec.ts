import {
  AUTH_ERROR,
  PASSWORD_RESET_PAGE,
  passwordResetTokenOf,
  SESSION_COOKIE,
} from '@nautelle/shared';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PrismaService } from '../database/prisma.service';
import { MAIL_OPTIONS, type MailOptions } from '../mail/mail-options';
import { FakeSmtpServer } from '../mail/testing/fake-smtp';
import {
  createUser,
  type E2eContext,
  login,
  nextIp,
  PASSWORD,
  resetDatabase,
  type Session,
  setCookies,
} from '../test/e2e-app';
import { THROTTLE_AFTER } from './login-throttle';
import { hashToken } from './tokens';
import { totpCode, totpStep } from './totp';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const APP_URL = 'https://nautelle.example.com';
const NEW_PASSWORD = 'a brand new passphrase';

/** The app with its email pointed at `smtpUrl`; null: no SMTP. */
const createApp = async (smtpUrl: string | null): Promise<E2eContext> => {
  const mail: MailOptions = {
    smtpUrl,
    from: 'Nautelle <nautelle@localhost>',
    appUrl: APP_URL,
    autoStart: false,
    intervalMs: 10_000,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_OPTIONS)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
  };
};

/** Every route here is limited to 10 requests a minute per address; tests lift it. */
const liftRequestLimit = (ctx: E2eContext) =>
  jest
    .spyOn(ctx.app.get<ThrottlerStorage>(ThrottlerStorage), 'increment')
    .mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

const tokenOf = (path: string): string => {
  const [page, hash] = path.split('#');
  expect(page).toBe(PASSWORD_RESET_PAGE);
  const token = passwordResetTokenOf(`#${hash}`);
  if (!token) throw new Error(`no token in ${path}`);
  return token;
};

describe('password and two-factor reset (e2e, C-402)', () => {
  let previousKey: string | undefined;
  beforeAll(() => {
    previousKey = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = ENCRYPTION_KEY;
  });
  afterAll(() => {
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousKey;
  });

  describe('admin reset link', () => {
    let ctx: E2eContext;
    let requestLimit: jest.SpyInstance | undefined;
    let admin: Session;

    beforeAll(async () => {
      ctx = await createApp(null);
    });
    afterAll(() => ctx.app.close());
    beforeEach(async () => {
      await resetDatabase(ctx.prisma);
      requestLimit = liftRequestLimit(ctx);
      await createUser(ctx.prisma, 'admin@example.com', 'admin');
      admin = await login(ctx, 'admin@example.com');
    });
    afterEach(() => requestLimit?.mockRestore());

    const issue = (userId: string, kind: 'password' | 'two_factor') =>
      admin.send('post', `/admin/users/${userId}/reset-link`, { kind });

    const redeem = (body: object, ip = nextIp()) =>
      ctx
        .http()
        .post('/auth/password-reset')
        .set('X-Forwarded-For', ip)
        .send(body);

    const check = (token: string, ip = nextIp()) =>
      ctx
        .http()
        .post('/auth/password-reset/check')
        .set('X-Forwarded-For', ip)
        .send({ token });

    const signIn = (email: string, password: string) =>
      ctx
        .http()
        .post('/auth/login')
        .set('X-Forwarded-For', nextIp())
        .send({ email, password });

    /** Enrols `email` in two-factor sign-in through the API; returns the secret. */
    const enrol = async (email: string) => {
      const session = await login(ctx, email);
      const setup = await session.send('post', '/auth/me/two-factor/setup', {
        password: PASSWORD,
      });
      expect(setup.status).toBe(200);
      const secret: string = setup.body.secret;
      const enabled = await session.send('post', '/auth/me/two-factor/enable', {
        code: totpCode(secret, totpStep(new Date())),
      });
      expect(enabled.status).toBe(200);
      return secret;
    };

    it('gets a locked-out user back in, once, and ends their other sessions', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const other = await login(ctx, 'op@example.com');

      const issued = await issue(user.id, 'password');
      expect(issued.status).toBe(201);
      expect(issued.body.kind).toBe('password');
      const token = tokenOf(issued.body.path);
      const expiresIn = new Date(issued.body.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(23 * 60 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(24 * 60 * 60_000);

      // Only the hash is stored.
      const row = await ctx.prisma.passwordResetLink.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.tokenHash).not.toContain(token);
      expect(row).toMatchObject({ via: 'admin', usedAt: null });

      const checked = await check(token);
      expect(checked.status).toBe(200);
      expect(checked.body).toMatchObject({
        email: 'op@example.com',
        kind: 'password',
        codeRequired: false,
      });

      const reset = await redeem({ token, newPassword: NEW_PASSWORD });
      expect(reset.status).toBe(200);
      expect(reset.body.email).toBe('op@example.com');
      expect(setCookies(reset).join(';')).toContain(`${SESSION_COOKIE}=`);

      // The old session is over; the new password signs in, the old does not.
      expect((await other.get('/auth/me')).status).toBe(401);
      expect((await signIn('op@example.com', NEW_PASSWORD)).status).toBe(200);
      expect((await signIn('op@example.com', PASSWORD)).status).toBe(401);

      // It works once.
      const again = await redeem({
        token,
        newPassword: 'yet another passphrase',
      });
      expect(again.status).toBe(410);
      expect(again.body.error).toBe(AUTH_ERROR.resetLinkInvalid);
      expect((await check(token)).status).toBe(410);

      const records = await ctx.prisma.auditRecord.findMany({
        where: { targetType: 'user', targetId: user.id },
        orderBy: { seq: 'asc' },
      });
      const made = records.find((r) => r.action === 'user.reset_link');
      expect(made).toMatchObject({ result: 'ok', actorType: 'user' });
      expect(made?.after).toMatchObject({ kind: 'password' });
      const used = records.find((r) => r.action === 'auth.password_reset');
      expect(used).toMatchObject({ result: 'ok', actorUserId: user.id });
      expect(used?.meta).toMatchObject({ kind: 'password', via: 'admin' });
      expect(
        JSON.stringify(records.map((r) => [r.before, r.after, r.meta])),
      ).not.toContain(token);
    });

    it('refuses an expired link', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const token = tokenOf((await issue(user.id, 'password')).body.path);
      await ctx.prisma.passwordResetLink.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      expect((await check(token)).status).toBe(410);
      const reset = await redeem({ token, newPassword: NEW_PASSWORD });
      expect(reset.status).toBe(410);
      expect(reset.body.error).toBe(AUTH_ERROR.resetLinkInvalid);
      expect((await signIn('op@example.com', PASSWORD)).status).toBe(200);
    });

    it('replaces the unused link with a new one', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const first = tokenOf((await issue(user.id, 'password')).body.path);
      const second = tokenOf((await issue(user.id, 'password')).body.path);

      expect((await check(first)).status).toBe(410);
      expect((await check(second)).status).toBe(200);
    });

    it('slows down a source that guesses tokens', async () => {
      const ip = nextIp();
      for (let i = 0; i < THROTTLE_AFTER; i += 1) {
        expect((await check(`guess-${i}`, ip)).status).toBe(410);
      }
      const throttled = await check('guess-last', ip);
      expect(throttled.status).toBe(429);
      expect(throttled.body.error).toBe(AUTH_ERROR.throttled);
      expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
      // Another source is not slowed down, and nobody is locked out.
      expect((await check('guess-elsewhere')).status).toBe(410);
      await createUser(ctx.prisma, 'op@example.com', 'operator');
      expect((await signIn('op@example.com', PASSWORD)).status).toBe(200);
    });

    it('asks for a code when the account has two-factor sign-in', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const secret = await enrol('op@example.com');
      const token = tokenOf((await issue(user.id, 'password')).body.path);

      expect((await check(token)).body.codeRequired).toBe(true);
      const missing = await redeem({ token, newPassword: NEW_PASSWORD });
      expect(missing.status).toBe(401);
      expect(missing.body.error).toBe(AUTH_ERROR.twoFactorRequired);
      const wrong = await redeem({
        token,
        newPassword: NEW_PASSWORD,
        code: '000000',
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error).toBe(AUTH_ERROR.twoFactorInvalid);

      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { totpLastStep: null },
      });
      const reset = await redeem({
        token,
        newPassword: NEW_PASSWORD,
        code: totpCode(secret, totpStep(new Date())),
      });
      expect(reset.status).toBe(200);
      const after = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.totpEnabledAt).not.toBeNull();
    });

    it('resets two-factor sign-in with a 2FA link, without a code', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      await enrol('op@example.com');
      const other = await login(ctx, 'op@example.com').catch(() => null);
      expect(other).toBeNull(); // the password alone no longer signs in

      const issued = await issue(user.id, 'two_factor');
      expect(issued.status).toBe(201);
      const token = tokenOf(issued.body.path);
      expect((await check(token)).body).toMatchObject({
        kind: 'two_factor',
        codeRequired: false,
      });

      const reset = await redeem({ token, newPassword: NEW_PASSWORD });
      expect(reset.status).toBe(200);
      expect(reset.body.twoFactorEnabled).toBe(false);
      const after = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.totpEnabledAt).toBeNull();
      expect(after.totpSecret).toBeNull();
      expect(
        await ctx.prisma.userRecoveryCode.count({ where: { userId: user.id } }),
      ).toBe(0);
      expect((await signIn('op@example.com', NEW_PASSWORD)).status).toBe(200);

      const record = await ctx.prisma.auditRecord.findFirstOrThrow({
        where: { action: 'auth.password_reset', targetId: user.id },
      });
      expect(record.after).toEqual({ twoFactorEnabled: false });
    });

    it('refuses what it cannot reset', async () => {
      const self = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      const plain = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const pending = await createUser(
        ctx.prisma,
        'new@example.com',
        'viewer',
        'pending',
      );

      const own = await issue(self.id, 'password');
      expect(own.status).toBe(403);
      const noTwoFactor = await issue(plain.id, 'two_factor');
      expect(noTwoFactor.status).toBe(409);
      expect(noTwoFactor.body.error).toBe(AUTH_ERROR.twoFactorNotEnabled);
      const notActive = await issue(pending.id, 'password');
      expect(notActive.status).toBe(409);
      expect((await issue('missing', 'password')).status).toBe(404);
      expect(
        (
          await admin.send('post', `/admin/users/${plain.id}/reset-link`, {
            kind: 'everything',
          })
        ).status,
      ).toBe(400);

      const operator = await login(ctx, 'op@example.com');
      const notAdmin = await operator.send(
        'post',
        `/admin/users/${self.id}/reset-link`,
        { kind: 'password' },
      );
      expect(notAdmin.status).toBe(403);
    });

    it('voids a link of an account disabled after it was made', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const token = tokenOf((await issue(user.id, 'password')).body.path);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { status: 'disabled' },
      });
      expect((await redeem({ token, newPassword: NEW_PASSWORD })).status).toBe(
        410,
      );
    });

    it('has no Forgot password without SMTP', async () => {
      expect((await ctx.http().get('/auth/password-reset')).body).toEqual({
        selfService: false,
      });
      const asked = await ctx
        .http()
        .post('/auth/password-reset/request')
        .set('X-Forwarded-For', nextIp())
        .send({ email: 'op@example.com' });
      expect(asked.status).toBe(409);
      expect(asked.body.error).toBe(AUTH_ERROR.passwordResetUnavailable);
    });
  });

  describe('Forgot password by email', () => {
    let ctx: E2eContext;
    let smtp: FakeSmtpServer;
    let requestLimit: jest.SpyInstance | undefined;

    beforeAll(async () => {
      smtp = new FakeSmtpServer();
      await smtp.start();
      ctx = await createApp(smtp.url());
    });
    afterAll(async () => {
      await ctx.app.close();
      await smtp.stop();
    });
    beforeEach(async () => {
      await resetDatabase(ctx.prisma);
      smtp.clear();
      requestLimit = liftRequestLimit(ctx);
    });
    afterEach(() => requestLimit?.mockRestore());

    const ask = (email: string, ip = nextIp()) =>
      ctx
        .http()
        .post('/auth/password-reset/request')
        .set('X-Forwarded-For', ip)
        .send({ email });

    /** The emails sent so far, once `count` of them arrived. */
    const emails = async (count: number) => {
      for (let i = 0; i < 100 && smtp.messages.length < count; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return smtp.messages;
    };

    /** Lets any email still on its way arrive. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

    it('emails a link that resets the password, end to end', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      const other = await login(ctx, 'op@example.com');
      expect((await ctx.http().get('/auth/password-reset')).body).toEqual({
        selfService: true,
      });

      const asked = await ask('OP@example.com');
      expect(asked.status).toBe(202);
      const [email] = await emails(1);
      expect(email.to).toEqual(['op@example.com']);
      expect(email.subject).toBe('Reset your Nautelle password');
      const link = new RegExp(
        `${APP_URL.replace(/\./g, '\\.')}(${PASSWORD_RESET_PAGE}#token=[A-Za-z0-9_-]+)`,
      ).exec(email.body);
      expect(link).not.toBeNull();
      const token = tokenOf(link?.[1] ?? '');

      const reset = await ctx
        .http()
        .post('/auth/password-reset')
        .set('X-Forwarded-For', nextIp())
        .send({ token, newPassword: NEW_PASSWORD });
      expect(reset.status).toBe(200);
      expect((await other.get('/auth/me')).status).toBe(401);
      const used = await ctx.prisma.passwordResetLink.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(used.via).toBe('email');
      expect(used.usedAt).not.toBeNull();
      expect(used.expiresAt.getTime() - used.createdAt.getTime()).toBe(
        60 * 60_000,
      );
    });

    it('answers the same whether or not the address has an account', async () => {
      await createUser(ctx.prisma, 'op@example.com', 'operator');
      await createUser(ctx.prisma, 'off@example.com', 'operator', 'disabled');

      const known = await ask('op@example.com');
      const unknown = await ask('nobody@example.com');
      const disabled = await ask('off@example.com');
      for (const response of [unknown, disabled]) {
        expect(response.status).toBe(known.status);
        expect(response.body).toEqual(known.body);
        expect(response.text).toBe(known.text);
      }
      await emails(1);
      await settle();
      expect(smtp.messages.map((m) => m.to)).toEqual([['op@example.com']]);

      // The audit records it against the address as typed, never the account.
      const records = await ctx.prisma.auditRecord.findMany({
        where: { action: 'auth.password_reset_request' },
      });
      expect(new Set(records.map((r) => r.targetType))).toEqual(
        new Set(['email']),
      );
    });

    it('sends at most one email a minute and slows down a flood', async () => {
      await createUser(ctx.prisma, 'op@example.com', 'operator');
      const ip = nextIp();
      for (let i = 0; i < THROTTLE_AFTER; i += 1) {
        expect((await ask('op@example.com', ip)).status).toBe(202);
      }
      const throttled = await ask('op@example.com', ip);
      expect(throttled.status).toBe(429);
      expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);

      await emails(1);
      await settle();
      expect(smtp.messages).toHaveLength(1);
      // The owner still signs in: the account is never locked.
      expect(
        (
          await ctx
            .http()
            .post('/auth/login')
            .set('X-Forwarded-For', ip)
            .send({ email: 'op@example.com', password: PASSWORD })
        ).status,
      ).toBe(200);
    });

    it('never voids the link an admin handed over', async () => {
      const user = await createUser(ctx.prisma, 'op@example.com', 'operator');
      await createUser(ctx.prisma, 'admin@example.com', 'admin');
      const admin = await login(ctx, 'admin@example.com');
      const issued = await admin.send(
        'post',
        `/admin/users/${user.id}/reset-link`,
        { kind: 'password' },
      );
      const token = tokenOf(issued.body.path);

      await ask('op@example.com');
      await emails(1);
      const checked = await ctx
        .http()
        .post('/auth/password-reset/check')
        .set('X-Forwarded-For', nextIp())
        .send({ token });
      expect(checked.status).toBe(200);
    });
  });
});
