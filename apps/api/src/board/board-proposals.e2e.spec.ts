import { BOARD_ERROR } from '@nautelle/shared';
import { writeStarterLabels } from './starter-labels';
import { BoardWorld } from './testing/board-e2e';

interface Seed {
  title: string;
  kind?: 'feature' | 'bug' | 'task';
  labels?: string[];
  dependsOn?: number[];
}

/**
 * C-506 (ADR-0126): Create selected turns the ticked proposals of a finished
 * analysis card into cards linked back to it; Complete without cards
 * dismisses them; either completes the analysis card.
 */
describe('proposals of an analysis card (C-506, e2e)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    await writeStarterLabels(w.ctx.prisma, w.a);
  });
  afterEach(() => w.work.settled());

  /** An analysis card in Finished with one finished round and its pending proposals. */
  const seedAnalysis = async (
    seeds: Seed[],
    over: { kind?: 'analysis' | 'feature'; column?: 'finished' | 'todo' } = {},
  ) => {
    const now = new Date();
    const run = await w.ctx.prisma.run.create({
      data: {
        kind: 'card',
        projectId: w.a,
        status: 'succeeded',
        model: 'sonnet',
        triggeredByType: 'user',
        startedAt: now,
        updatedAt: now,
      },
    });
    const kind = over.kind ?? 'analysis';
    const card = await w.ctx.prisma.boardCard.create({
      data: {
        projectId: w.a,
        number: 1,
        shortId: 'abcd1231',
        title: 'Why is the fleet page slow',
        kind,
        kindSource: 'person',
        column: over.column ?? 'finished',
        position: 0,
        issueOnRun: false,
        specOnRun: false,
        movedAt: now,
        rounds: {
          create: {
            round: 1,
            runId: run.id,
            trigger: 'run',
            phase: 'finished',
            report: 'Two gaps.',
            cardTitle: 'Why is the fleet page slow',
            cardBody: '',
            cardKind: kind,
          },
        },
      },
      include: { rounds: true },
    });
    const roundId = card.rounds[0].id;
    await w.ctx.prisma.boardCardProposal.createMany({
      data: seeds.map((seed, position) => ({
        cardId: card.id,
        roundId,
        position,
        title: seed.title,
        body: `${seed.title}.`,
        kind: seed.kind ?? 'feature',
        labels: seed.labels ?? [],
        dependsOn: seed.dependsOn ?? [],
      })),
    });
    return { card, roundId };
  };

  const THREE: Seed[] = [
    { title: 'Index the runs table', labels: ['docs', 'no-such-label'] },
    { title: 'Drop the poller', kind: 'bug' },
    { title: 'Cache the queue', dependsOn: [0, 1] },
  ];

  const create = (
    body: object,
    session = w.operator,
    projectId = w.a,
    number = 1,
  ) =>
    session.send(
      'post',
      `${w.path(projectId)}/board/cards/${number}/proposals/create`,
      body,
    );

  const dismiss = (session = w.operator, projectId = w.a) =>
    session.send(
      'post',
      `${w.path(projectId)}/board/cards/1/proposals/dismiss`,
      {},
    );

  const statuses = (cardId: string) =>
    w.ctx.prisma.boardCardProposal
      .findMany({ where: { cardId }, orderBy: { position: 'asc' } })
      .then((rows) => rows.map((r) => r.status));

  it('creates the ticked proposals linked to the analysis, dismisses the rest and completes it', async () => {
    const { card, roundId } = await seedAnalysis(THREE);
    const response = await create({
      positions: [2, 0],
      column: 'todo',
      roundId,
    });
    expect(response.status).toBe(200);
    expect(response.body.created).toEqual([
      { number: 2, title: 'Index the runs table' },
      { number: 3, title: 'Cache the queue' },
    ]);
    // 2 depends on 0 (selected) and on 1 (not): that one link is dropped.
    expect(response.body.droppedLinks).toEqual([[2, 1]]);
    expect(response.body.card).toMatchObject({
      number: 1,
      column: 'completed',
    });

    const first = await w.card(2);
    const second = await w.card(3);
    expect(first).toMatchObject({
      column: 'todo',
      kind: 'feature',
      originCardId: card.id,
      createdById: w.operatorId,
    });
    expect(second).toMatchObject({ column: 'todo', originCardId: card.id });
    const links = await w.ctx.prisma.boardCardDependency.findMany();
    expect(links).toEqual([
      expect.objectContaining({ cardId: second.id, dependsOnId: first.id }),
    ]);
    expect(await statuses(card.id)).toEqual([
      'created',
      'dismissed',
      'created',
    ]);
    const rows = await w.ctx.prisma.boardCardProposal.findMany({
      where: { cardId: card.id },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => r.createdCardId)).toEqual([
      first.id,
      null,
      second.id,
    ]);
    expect(rows.every((r) => r.decidedById === w.operatorId)).toBe(true);
    expect(await w.card(1)).toMatchObject({
      column: 'completed',
      completedById: w.operatorId,
    });
    // The label the project has is applied as the model's; the unknown name is not.
    const labels = await w.ctx.prisma.boardCardLabel.findMany({
      where: { cardId: first.id },
      include: { label: true },
    });
    expect(labels.map((l) => [l.label.name, l.source])).toEqual([
      ['docs', 'model'],
    ]);
    expect(
      (await w.audit('card.proposals_created')).map((r) => r.after),
    ).toEqual([{ number: 1, created: [2, 3] }]);
  });

  it('puts the cards in the Inbox when asked', async () => {
    const { roundId } = await seedAnalysis(THREE);
    const response = await create({
      positions: [0, 1],
      column: 'inbox',
      roundId,
    });
    expect(response.status).toBe(200);
    expect(await w.card(2)).toMatchObject({ column: 'inbox' });
    expect(await w.card(3)).toMatchObject({ column: 'inbox' });
  });

  it('refuses a repeat with 409 and creates nothing twice', async () => {
    const { card, roundId } = await seedAnalysis(THREE);
    const body = { positions: [0], column: 'todo', roundId };
    expect((await create(body)).status).toBe(200);
    const again = await create(body);
    expect(again.status).toBe(409);
    expect(
      await w.ctx.prisma.boardCard.count({ where: { projectId: w.a } }),
    ).toBe(2);
    expect(await statuses(card.id)).toEqual([
      'created',
      'dismissed',
      'dismissed',
    ]);
  });

  it('refuses a stale round, a decided position, and a card that is not a finished analysis', async () => {
    const { roundId } = await seedAnalysis(THREE);
    const stale = await create({
      positions: [0],
      column: 'todo',
      roundId: 'older-round',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe(BOARD_ERROR.proposalsStale);
    const unknown = await create({ positions: [7], column: 'todo', roundId });
    expect(unknown.status).toBe(409);
    expect(unknown.body.error).toBe(BOARD_ERROR.proposalsDecided);
    expect(
      await w.ctx.prisma.boardCard.count({ where: { projectId: w.a } }),
    ).toBe(1);
  });

  it('refuses a feature card and a card outside Finished', async () => {
    await seedAnalysis(THREE, { kind: 'feature' });
    const feature = await create({
      positions: [0],
      column: 'todo',
      roundId: 'x',
    });
    expect(feature.status).toBe(409);
    expect(feature.body.error).toBe(BOARD_ERROR.notAnalysis);
    expect((await dismiss()).status).toBe(409);
  });

  it('refuses an analysis outside Finished', async () => {
    const { roundId } = await seedAnalysis(THREE, { column: 'todo' });
    const response = await create({ positions: [0], column: 'todo', roundId });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(BOARD_ERROR.wrongColumn);
    expect(await w.card(1)).toMatchObject({ column: 'todo' });
  });

  it('refuses a task proposal while the project has no task kind, and changes nothing', async () => {
    const { card, roundId } = await seedAnalysis([
      { title: 'Index the runs table' },
      { title: 'Rotate the keys', kind: 'task' },
    ]);
    const response = await create({
      positions: [0, 1],
      column: 'todo',
      roundId,
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe(BOARD_ERROR.kindUnavailable);
    expect(await statuses(card.id)).toEqual(['pending', 'pending']);
    expect(await w.card(1)).toMatchObject({ column: 'finished' });
    expect(
      await w.ctx.prisma.boardCard.count({ where: { projectId: w.a } }),
    ).toBe(1);
  });

  it('completes without cards: every pending proposal is dismissed', async () => {
    const { card } = await seedAnalysis(THREE);
    const response = await dismiss();
    expect(response.status).toBe(204);
    expect(await statuses(card.id)).toEqual([
      'dismissed',
      'dismissed',
      'dismissed',
    ]);
    expect(await w.card(1)).toMatchObject({
      column: 'completed',
      completedById: w.operatorId,
    });
    expect(
      await w.ctx.prisma.boardCard.count({ where: { projectId: w.a } }),
    ).toBe(1);
    expect((await w.audit('card.proposals_dismissed')).length).toBe(1);
    expect((await dismiss()).status).toBe(409);
  });

  it('is for operators of the project: a viewer is 403, another project 404', async () => {
    const { card, roundId } = await seedAnalysis(THREE);
    const body = { positions: [0], column: 'todo', roundId };
    expect((await create(body, w.viewer)).status).toBe(403);
    expect((await dismiss(w.viewer)).status).toBe(403);
    expect((await create(body, w.operatorOfB)).status).toBe(404);
    expect((await dismiss(w.operatorOfB)).status).toBe(404);
    expect((await create(body, w.operator, w.a, 99)).status).toBe(404);
    expect(await statuses(card.id)).toEqual(['pending', 'pending', 'pending']);
  });

  it('validates the body', async () => {
    const { roundId } = await seedAnalysis(THREE);
    for (const body of [
      { positions: [], column: 'todo', roundId },
      { positions: [0, 0], column: 'todo', roundId },
      { positions: [0], column: 'finished', roundId },
      { positions: [0], column: 'todo' },
    ]) {
      expect((await create(body)).status).toBe(400);
    }
  });
});
