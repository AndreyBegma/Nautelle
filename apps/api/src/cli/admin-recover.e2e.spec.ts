import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { passwordResetTokenOf } from '@nautelle/shared';
import {
  createE2eApp,
  createUser,
  type E2eContext,
  resetDatabase,
} from '../test/e2e-app';

const NEW_PASSWORD = 'a brand new passphrase';

const runCli = (...args: string[]) =>
  spawnSync(
    process.execPath,
    [
      require.resolve('ts-node/dist/bin.js'),
      resolve(__dirname, 'admin-recover.ts'),
      ...args,
    ],
    {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, APP_URL: 'https://nautelle.example.com' },
      encoding: 'utf8',
      timeout: 60_000,
    },
  );

describe('admin:recover (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(() => resetDatabase(ctx.prisma));

  const redeem = (token: string) =>
    ctx
      .http()
      .post('/auth/password-reset')
      .send({ token, newPassword: NEW_PASSWORD });

  it('prints a link that turns two-factor sign-in off once, and audits it', async () => {
    const admin = await createUser(ctx.prisma, 'root@example.com', 'admin');
    await ctx.prisma.user.update({
      where: { id: admin.id },
      data: { totpEnabledAt: new Date() },
    });

    const run = runCli('--email', 'Root@Example.com');
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const link = run.stdout.trim();
    expect(link).toMatch(
      /^https:\/\/nautelle\.example\.com\/reset-password#token=\S+$/,
    );
    const token = passwordResetTokenOf(link.slice(link.indexOf('#')));
    expect(token).not.toBeNull();

    const first = await redeem(token as string);
    expect(first.status).toBe(200);
    const after = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
    });
    expect(after.totpEnabledAt).toBeNull();

    const second = await redeem(token as string);
    expect(second.status).toBe(410);

    const records = await ctx.prisma.auditRecord.findMany({
      where: { action: 'user.reset_link', targetId: admin.id },
    });
    expect(records).toEqual([
      expect.objectContaining({
        actorType: 'system',
        targetType: 'user',
        result: 'ok',
        after: expect.objectContaining({ kind: 'two_factor' }),
        meta: expect.objectContaining({ via: 'cli' }),
      }),
    ]);
  }, 150_000); // one cold ts-node run of the real script

  it('refuses an operator and an unknown email, and issues nothing', async () => {
    const startedAt = new Date();
    await createUser(ctx.prisma, 'ops@example.com', 'operator');

    const operator = runCli('--email', 'ops@example.com', '--kind', 'password');
    expect(operator.status).not.toBe(0);
    expect(operator.stdout).toBe('');
    expect(operator.stderr).toContain('Not an admin account');

    const unknown = runCli('--email', 'nobody@example.com');
    expect(unknown.status).not.toBe(0);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toContain('User not found');

    expect(await ctx.prisma.passwordResetLink.count()).toBe(0);
    // The audit chain outlives `resetDatabase`, so only the new records count.
    expect(
      await ctx.prisma.auditRecord.count({
        where: { action: 'user.reset_link', ts: { gte: startedAt } },
      }),
    ).toBe(0);
  }, 150_000); // two cold ts-node runs of the real script
});
