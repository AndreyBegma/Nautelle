import type { UserSettingsView } from '@nautelle/shared';
import {
  createE2eApp,
  createUser,
  type E2eContext,
  login,
  resetDatabase,
  type Session,
} from '../test/e2e-app';

/** #337 D9: `GET/PUT /me/settings` — the caller's own row, nobody else's. */
describe('/me/settings (e2e)', () => {
  let ctx: E2eContext;
  let ann: Session;
  let bob: Session;
  let annId: string;
  let bobId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    annId = (await createUser(ctx.prisma, 'ann@example.com', 'operator')).id;
    bobId = (await createUser(ctx.prisma, 'bob@example.com', 'viewer')).id;
    ann = await login(ctx, 'ann@example.com');
    bob = await login(ctx, 'bob@example.com');
  });

  const settingsOf = async (session: Session) => {
    const response = await session.get('/me/settings');
    expect(response.status).toBe(200);
    return response.body as UserSettingsView;
  };

  it('answers the default, sonnet, for a person without a row', async () => {
    expect(await settingsOf(ann)).toEqual({
      planningModel: 'sonnet',
      toolUseTimeoutMinutes: null,
    });
    expect(await ctx.prisma.userSettings.count()).toBe(0);
  });

  it('writes only the caller’s row, and null clears it back to the default', async () => {
    const put = await ann.send('put', '/me/settings', {
      planningModel: 'opus',
    });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      planningModel: 'opus',
      toolUseTimeoutMinutes: null,
    });
    expect(await settingsOf(ann)).toEqual({
      planningModel: 'opus',
      toolUseTimeoutMinutes: null,
    });
    // Bob, any role, keeps his own default.
    expect(await settingsOf(bob)).toEqual({
      planningModel: 'sonnet',
      toolUseTimeoutMinutes: null,
    });
    expect(
      await ctx.prisma.userSettings.findMany({ select: { userId: true } }),
    ).toEqual([{ userId: annId }]);

    await bob.send('put', '/me/settings', { planningModel: 'fable' });
    expect(await settingsOf(ann)).toEqual({
      planningModel: 'opus',
      toolUseTimeoutMinutes: null,
    });
    expect(await settingsOf(bob)).toEqual({
      planningModel: 'fable',
      toolUseTimeoutMinutes: null,
    });
    expect(
      (
        await ctx.prisma.userSettings.findUniqueOrThrow({
          where: { userId: bobId },
        })
      ).planningModel,
    ).toBe('fable');

    const cleared = await ann.send('put', '/me/settings', {
      planningModel: null,
    });
    expect(cleared.body).toEqual({
      planningModel: 'sonnet',
      toolUseTimeoutMinutes: null,
    });
  });

  it('refuses a model outside the catalog, a missing field, and extra fields', async () => {
    for (const body of [
      { planningModel: 'gpt-5' },
      { planningModel: '--dangerously-skip-permissions' },
      {},
      { planningModel: 'opus', userId: bobId },
    ]) {
      const response = await ann.send('put', '/me/settings', body);
      expect(response.status).toBe(400);
    }
    expect(await ctx.prisma.userSettings.count()).toBe(0);
  });

  it('keeps the tool-use timeout beside the model, and null clears it (C-401)', async () => {
    const put = await ann.send('put', '/me/settings', {
      toolUseTimeoutMinutes: 120,
    });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      planningModel: 'sonnet',
      toolUseTimeoutMinutes: 120,
    });
    await ann.send('put', '/me/settings', { planningModel: 'opus' });
    expect(await settingsOf(ann)).toEqual({
      planningModel: 'opus',
      toolUseTimeoutMinutes: 120,
    });
    const cleared = await ann.send('put', '/me/settings', {
      toolUseTimeoutMinutes: null,
    });
    expect(cleared.body).toEqual({
      planningModel: 'opus',
      toolUseTimeoutMinutes: null,
    });
    const [audit] = await ctx.prisma.auditRecord.findMany({
      where: { action: 'user.update', actorUserId: annId },
      orderBy: { seq: 'asc' },
    });
    expect(audit).toMatchObject({
      before: { toolUseTimeoutMinutes: null },
      after: { toolUseTimeoutMinutes: 120 },
    });
  });

  it('refuses a timeout under a minute, over 12 hours, or not whole', async () => {
    for (const toolUseTimeoutMinutes of [0, 721, 2.5, '60']) {
      const response = await ann.send('put', '/me/settings', {
        toolUseTimeoutMinutes,
      });
      expect(response.status).toBe(400);
    }
    expect(await ctx.prisma.userSettings.count()).toBe(0);
  });

  it('needs a session', async () => {
    expect((await ctx.http().get('/me/settings')).status).toBe(401);
  });
});
