import type { BoardCardDetail, BoardView } from '@nautelle/shared';
import { BudgetSweep } from '../budgets/budget-sweep';
import { Feed, seedSnapshotPrices } from '../budgets/testing/budgets-e2e';
import { ingest } from '../usage/testing/usage-e2e';
import { BoardWorld, failed, ROOT_A } from './testing/board-e2e';

/**
 * C-399 (ADR-0101): a hard budget that is reached pauses the running card
 * rounds in its scope; Resume continues the same session once it allows.
 */
describe('board budget pause (e2e)', () => {
  const w = new BoardWorld();
  let sweep: BudgetSweep;

  beforeAll(async () => {
    await w.init();
    sweep = w.ctx.app.get(BudgetSweep);
  });
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    await seedSnapshotPrices(w.ctx.prisma);
  });
  afterEach(() => w.work.settled());

  const feed = new Feed();
  let request = 0;

  /** Card `number`'s session spends $1.50 a request, `n` times. */
  const spend = async (number: number, n: number, projectId = w.a) => {
    const card = await w.card(number, projectId);
    const session = card.sessionId as string;
    const run = await w.ctx.prisma.run.findUniqueOrThrow({
      where: { id: card.rounds[0].runId },
    });
    const ts = (ms: number) =>
      new Date(run.startedAt.getTime() + ms).toISOString();
    const events = [
      feed.session(session, `${ROOT_A}-card-${number}`, ts(1000), {
        projectId,
      }),
    ];
    for (let i = 0; i < n; i += 1) {
      request += 1;
      events.push(feed.spend(session, `r-${request}`, ts(2000 + i)));
    }
    await ingest(w.ctx, w.runnerId, events);
  };

  const budget = (data: {
    scope: 'project' | 'user';
    action?: 'stop' | 'alert';
    limitUsd?: string;
    projectId?: string;
    userId?: string;
  }) =>
    w.ctx.prisma.budget.create({
      data: {
        scope: data.scope,
        projectId: data.scope === 'project' ? (data.projectId ?? w.a) : null,
        userId: data.scope === 'user' ? (data.userId ?? w.operatorId) : null,
        period: 'day',
        timezone: 'UTC',
        limitUsd: data.limitUsd ?? '1',
        thresholds: [100],
        action: data.action ?? 'stop',
      },
    });

  /** The budgets are evaluated, as the sweep or a usage batch would. */
  const evaluate = async () => {
    await sweep.sweep();
    await w.work.settled();
  };

  const stops = () => w.sent('card.stop');
  const pausedEvents = () =>
    w.ctx.prisma.event.findMany({
      where: { type: 'card.paused' },
      orderBy: { id: 'asc' },
    });
  const view = async (number: number) =>
    (await w.operator.get(`${w.path()}/board/cards/${number}`))
      .body as BoardCardDetail;

  it('pauses a running round when its project hard budget is reached, keeping the session and the worktree', async () => {
    await w.createCard({ title: 'Add login' });
    expect((await w.runCard(1)).status).toBe(200);
    const before = await w.card(1);
    await spend(1, 1);
    const created = await budget({ scope: 'project' });

    await evaluate();

    // The runner was told to stop the session — `card.stop` keeps the
    // worktree; nothing else was sent.
    expect(stops()).toEqual([{ cardId: before.id, projectId: w.a }]);
    expect(w.sent('card.close')).toEqual([]);
    const after = await w.card(1);
    expect(after.rounds).toHaveLength(1);
    expect(after.rounds[0]).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
    // The card keeps its column, branch and Claude session.
    expect(after).toMatchObject({
      column: 'in_progress',
      branch: before.branch,
      sessionId: before.sessionId,
    });
    const run = await w.ctx.prisma.run.findUniqueOrThrow({
      where: { id: after.rounds[0].runId },
    });
    expect(run).toMatchObject({
      status: 'abandoned',
      outcome: 'Paused: a hard budget was reached',
    });

    // The card reads "Paused: budget".
    expect((await view(1)).round).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
    const board = (await w.operator.get(`${w.path()}/board`)).body as BoardView;
    const face = board.columns
      .flatMap((c) => c.cards)
      .find((c) => c.number === 1);
    expect(face?.round).toMatchObject({
      pausedFor: 'budget',
    });

    // Inbox and Telegram hear of it through one server event.
    const [event] = await pausedEvents();
    expect(event).toMatchObject({ source: 'api' });
    expect(event.data).toMatchObject({
      cardId: before.id,
      number: 1,
      title: 'Add login',
      round: 1,
      reason: 'budget',
      budget: { id: created.id, scope: 'project', limitUsd: '1.00' },
    });
    const [audit] = await w.audit('card.paused');
    expect(audit).toMatchObject({ result: 'ok', actorType: 'system' });

    // Evaluating again finds nothing running: no second stop or event.
    await evaluate();
    expect(stops()).toHaveLength(1);
    expect(await pausedEvents()).toHaveLength(1);
  });

  it('refuses Resume while the budget is still reached, then continues the same session once it is raised', async () => {
    await w.createCard();
    await w.runCard(1);
    const { sessionId } = await w.card(1);
    await spend(1, 1);
    const created = await budget({ scope: 'project' });
    await evaluate();

    const refused = await w.runCard(1);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('budget_exceeded');
    expect(w.sent('card.run')).toHaveLength(1);

    await w.ctx.prisma.budget.update({
      where: { id: created.id },
      data: { limitUsd: '100' },
    });
    const resumed = await w.runCard(1);
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({ round: { round: 2 } });
    const [, second] = w.sent('card.run');
    // The same Claude session, resumed: its context is kept.
    expect(second.session).toEqual({ id: sessionId, resume: true });
    const card = await w.card(1);
    expect(card.rounds[0]).toMatchObject({ round: 1, pausedFor: 'budget' });
    expect(card.rounds[1]).toMatchObject({
      round: 2,
      trigger: 'run',
      pausedFor: null,
    });
  });

  it('a user budget pauses only the rounds that count toward that user', async () => {
    await w.createCard();
    await w.runCard(1);
    // Card 2 runs as the admin: it counts toward them, not the operator.
    await w.createCard();
    expect(
      (await w.admin.send('post', `${w.path()}/board/cards/2/run`, {})).status,
    ).toBe(200);
    await spend(1, 1);
    await budget({ scope: 'user', userId: w.operatorId });

    await evaluate();

    const [one, two] = [await w.card(1), await w.card(2)];
    expect(stops()).toEqual([{ cardId: one.id, projectId: w.a }]);
    expect(one.rounds[0]).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
    expect(two.rounds[0].phase).toBe('starting');
  });

  it("a soft budget only warns, and a project's hard budget leaves another project's rounds alone", async () => {
    await w.createCard();
    await w.runCard(1);
    await spend(1, 1);
    await w.createCard({}, w.operatorOfB, w.b);
    expect(
      (await w.operatorOfB.send('post', `${w.path(w.b)}/board/cards/1/run`, {}))
        .status,
    ).toBe(200);
    await spend(1, 1, w.b);
    await budget({ scope: 'project', action: 'alert' });
    await budget({ scope: 'project', projectId: w.b });

    await evaluate();

    const [inA, inB] = [await w.card(1), await w.card(1, w.b)];
    expect(stops()).toEqual([{ cardId: inB.id, projectId: w.b }]);
    expect(inA.rounds[0].phase).toBe('starting');
    expect(inB.rounds[0]).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
  });

  it('leaves running rounds alone while an override lifts the hard budget', async () => {
    await w.createCard();
    await w.runCard(1);
    await spend(1, 1);
    const lifted = await budget({ scope: 'project' });
    await w.ctx.prisma.budgetOverride.create({
      data: {
        budgetId: lifted.id,
        // Today's UTC day: the budget's current period.
        periodStart: new Date(
          `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
        ),
        until: new Date(Date.now() + 60 * 60 * 1000),
        reason: 'release day',
      },
    });

    await evaluate();

    expect(stops()).toEqual([]);
    expect((await w.card(1)).rounds[0].phase).toBe('starting');
    expect(await pausedEvents()).toEqual([]);
  });

  it('keeps the round running when the runner cannot stop it, and pauses it on the next evaluation', async () => {
    await w.createCard();
    await w.runCard(1);
    await spend(1, 1);
    await budget({ scope: 'project' });
    w.handlers['card.stop'] = () => failed('internal');

    await evaluate();

    expect((await w.card(1)).rounds[0].phase).toBe('starting');
    expect(await pausedEvents()).toEqual([]);

    delete w.handlers['card.stop'];
    await evaluate();
    expect((await w.card(1)).rounds[0]).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
    expect(await pausedEvents()).toHaveLength(1);
  });
});
