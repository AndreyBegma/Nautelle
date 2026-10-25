import type { OnboardingFacts, PushCheckView } from '@nautelle/shared';
import type { ProjectDiscoverResult } from '@nautelle/shared/protocol';
import type { Prisma } from '@prisma/client';
import { FakeRunner, ROOT } from '../projects/testing/projects-e2e';
import {
  adminSession,
  createRunnerE2eApp,
  pairedRunner,
  type RunnerE2eContext,
  TestRunnerSocket,
} from '../runners/testing/runner-e2e';
import {
  createUser,
  login,
  resetDatabase,
  type Session,
} from '../test/e2e-app';

const DISCOVERED: ProjectDiscoverResult = {
  roots: ['/srv/dev'],
  repositories: [
    { path: ROOT, name: 'widget', repo: 'acme/widget', root: '/srv/dev' },
  ],
  truncated: false,
};

describe('onboarding (e2e, C-396)', () => {
  let ctx: RunnerE2eContext;
  let admin: Session;
  let runnerId: string;
  let token: string;
  const sockets: { close: () => unknown }[] = [];

  const connectRunner = async (): Promise<FakeRunner> => {
    const socket = new TestRunnerSocket(ctx.origin, token);
    sockets.push(socket);
    await socket.connect();
    return new FakeRunner(socket);
  };

  const seedProject = () =>
    ctx.prisma.project.create({
      data: {
        runnerId,
        rootPath: ROOT,
        repo: 'acme/widget',
        displayName: 'widget',
        baseBranch: 'main',
        baseSource: 'default',
        hasClaudeMd: false,
        hasAgentsMd: false,
        lastInspectedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });

  const seedCard = (
    projectId: string,
    number: number,
    data: Pick<
      Prisma.BoardCardUncheckedCreateInput,
      'prNumber' | 'prState' | 'mergedAt'
    > = {},
  ) =>
    ctx.prisma.boardCard.create({
      data: {
        projectId,
        number,
        shortId: `card000${number}`,
        title: `Card ${number}`,
        column: 'finished',
        position: number,
        issueOnRun: false,
        specOnRun: false,
        movedAt: new Date(),
        ...data,
      },
    });

  const facts = async (): Promise<OnboardingFacts> => {
    const response = await admin.get('/admin/onboarding');
    expect(response.status).toBe(200);
    return response.body as OnboardingFacts;
  };

  beforeAll(async () => {
    ctx = await createRunnerE2eApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    // Not tied to users, so the reset leaves them.
    await ctx.prisma.gitHubInstallation.deleteMany();
    admin = await adminSession(ctx);
    ({ runnerId, token } = await pairedRunner(ctx, admin));
  });
  afterEach(async () => {
    for (const s of sockets.splice(0)) await s.close();
  });

  it('lists the repositories under the runner’s allowed roots', async () => {
    const runner = await connectRunner();
    runner.answer = () => ({ ok: true, output: DISCOVERED });

    const response = await admin.send('post', '/admin/projects/discover', {
      runnerId,
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(DISCOVERED);
    expect(runner.received).toEqual([{ name: 'project.discover', args: {} }]);
  });

  it('runs a push check, keeps the latest answer, and counts it once the project is connected', async () => {
    const runner = await connectRunner();
    runner.answer = () => ({
      ok: true,
      output: {
        ok: false,
        remote: 'git@github.com:acme/widget.git',
        message: 'denied',
      },
    });

    const failed = await admin.send('post', '/admin/projects/push-check', {
      runnerId,
      path: ROOT,
    });
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ ok: false, message: 'denied' });
    expect(runner.received).toEqual([
      { name: 'project.push_check', args: { path: ROOT } },
    ]);
    // A check of a checkout no project uses yet is not a step done.
    expect((await facts()).pushCheck).toBeNull();

    runner.answer = () => ({
      ok: true,
      output: {
        ok: true,
        remote: 'git@github.com:acme/widget.git',
        message: 'git@github.com:acme/widget.git accepts pushes.',
      },
    });
    const passed = (
      await admin.send('post', '/admin/projects/push-check', {
        runnerId,
        path: ROOT,
      })
    ).body as PushCheckView;
    expect(passed.ok).toBe(true);
    expect(await ctx.prisma.repositoryPushCheck.count()).toBe(1);

    const project = await seedProject();
    expect((await facts()).pushCheck).toEqual({
      ...passed,
      projectId: project.id,
    });
  });

  it('refuses a push check outside an absolute path, and to a non-admin', async () => {
    const relative = await admin.send('post', '/admin/projects/push-check', {
      runnerId,
      path: 'srv/dev',
    });
    expect(relative.status).toBe(400);

    await createUser(ctx.prisma, 'op@example.com', 'operator');
    const operator = await login(ctx, 'op@example.com');
    expect(
      (await operator.send('post', '/admin/projects/discover', { runnerId }))
        .status,
    ).toBe(403);
    expect((await operator.get('/admin/onboarding')).status).toBe(403);
  });

  it('ticks every fact from real state', async () => {
    expect(await facts()).toEqual({
      profile: false,
      plugin: false,
      pushCheck: null,
      firstCard: 'none',
      githubApp: false,
      teammates: false,
    });

    const project = await seedProject();
    const profile = await ctx.prisma.runtimeProfile.create({
      data: {
        runnerId,
        key: 'claude-main',
        label: 'Claude',
        runtime: 'claude',
        env: {},
        args: [],
        authenticated: true,
      },
    });
    await ctx.prisma.project.update({
      where: { id: project.id },
      data: { defaultProfileId: profile.id },
    });
    await ctx.prisma.runner.update({
      where: { id: runnerId },
      data: {
        capabilities: {
          profiles: [
            {
              id: 'claude-main',
              agentdock: { plugin: 'nautelle@1.0.0', telemetry: true },
            },
          ],
        },
      },
    });
    await seedCard(project.id, 1, { prNumber: 7, prState: 'open' });
    await createUser(ctx.prisma, 'teammate@example.com', 'viewer');
    await ctx.prisma.gitHubApp.create({
      data: {
        appId: 1,
        slug: 'nautelle',
        ownerLogin: 'acme',
        privateKey: 'k',
        webhookSecret: 's',
        hookActive: true,
      },
    });
    await ctx.prisma.gitHubInstallation.create({
      data: {
        id: 42,
        accountLogin: 'acme',
        accountType: 'Organization',
        suspended: false,
        syncedAt: new Date(),
      },
    });

    expect(await facts()).toMatchObject({
      profile: true,
      plugin: true,
      firstCard: 'pr',
      githubApp: true,
      teammates: true,
    });

    await seedCard(project.id, 2, { mergedAt: new Date() });
    expect((await facts()).firstCard).toBe('merged');
  });
});
