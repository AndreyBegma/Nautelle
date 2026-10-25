import { ProjectInspector } from '../projects/project-inspector';
import { inspection } from '../projects/testing/projects-e2e';
import { BoardWorld, ROOT_A } from './testing/board-e2e';

/** C-400 (ADR-0107): a moved project runs its next card on the new runner. */
describe('board after a project move (e2e)', () => {
  const w = new BoardWorld();
  const NEW_ROOT = '/home/dev/code/widget';

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const post = (number: number, action: string) =>
    w.operator.send('post', `${w.path()}/board/cards/${number}/${action}`, {});

  /** A second runner with a `claude-main` profile; its inspection is faked. */
  const laptop = async (): Promise<{ id: string; profileId: string }> => {
    const runner = await w.ctx.prisma.runner.create({
      data: { name: 'laptop' },
    });
    const profile = await w.ctx.prisma.runtimeProfile.create({
      data: {
        runnerId: runner.id,
        key: 'claude-main',
        runtime: 'claude',
        label: 'Claude',
        env: {},
        args: [],
        authenticated: true,
      },
    });
    jest.spyOn(w.ctx.app.get(ProjectInspector), 'inspect').mockResolvedValue(
      inspection({
        root: NEW_ROOT,
        gitCommonDir: `${NEW_ROOT}/.git`,
      }),
    );
    return { id: runner.id, profileId: profile.id };
  };

  const runnersOf = (name: string): string[] =>
    jest
      .mocked(w.commands.send)
      .mock.calls.filter(([, n]) => n === name)
      .map(([runnerId]) => runnerId);

  it('sends the next round to the new runner and root, with a fresh session', async () => {
    await w.createCard();
    expect((await w.runCard(1)).status).toBe(200);
    expect((await post(1, 'stop')).status).toBe(200);
    const before = await w.card(1);
    expect(before.sessionId).not.toBeNull();

    const target = await laptop();
    const moved = await w.admin.send('post', `${w.path()}/move`, {
      runnerId: target.id,
      path: NEW_ROOT,
      defaultProfileId: target.profileId,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      project: { runnerId: target.id, rootPath: NEW_ROOT },
      from: { runnerId: w.runnerId, rootPath: ROOT_A },
    });

    // Without the move this round would resume the session on the old machine.
    expect((await w.runCard(1)).status).toBe(200);
    const after = await w.card(1);
    expect(after.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(runnersOf('card.run')).toEqual([w.runnerId, target.id]);
    expect(w.sent('card.run')[1]).toMatchObject({
      projectId: w.a,
      root: NEW_ROOT,
      session: { id: after.sessionId, resume: false },
      profileKey: 'claude-main',
    });
  });

  it('refuses the move while a round runs, and the round stays on the old runner', async () => {
    await w.createCard();
    expect((await w.runCard(1)).status).toBe(200);
    const target = await laptop();

    const refused = await w.admin.send('post', `${w.path()}/move`, {
      runnerId: target.id,
      path: NEW_ROOT,
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: 'work_running',
      message: 'Stop what runs first: C-1 Add login',
    });
    const project = await w.ctx.prisma.project.findUniqueOrThrow({
      where: { id: w.a },
    });
    expect(project).toMatchObject({ runnerId: w.runnerId, rootPath: ROOT_A });
    expect((await w.card(1)).sessionId).not.toBeNull();
  });
});
