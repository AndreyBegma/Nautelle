import type { BoardCardDetail } from '@nautelle/shared';
import type { LocalResponseMessage } from '@nautelle/shared/protocol';
import { LocalRequestRouter } from '../local/local-request-router';
import { BoardWorld } from './testing/board-e2e';

/** An analysis card worker's session; a feature card worker's session. */
const ANALYSIS_SESSION = '0b7e7c1e-5d0f-4c1a-9a51-2f3c4d5e6f71';
const FEATURE_SESSION = '0b7e7c1e-5d0f-4c1a-9a51-2f3c4d5e6f72';

const REPORT = 'Two gaps in the fleet page.\n\n## Details\nThe runs scan is slow.';

const proposal = (over: Record<string, unknown> = {}) => ({
  title: 'Index the runs table by project',
  body: 'The fleet page scans every run.',
  kind: 'feature',
  ...over,
});

/**
 * C-503 (ADR-0126): an analysis card finishes with `card.finishAnalysis` —
 * the report and the proposed cards are stored, the card moves to Finished
 * and nothing is collected: no pull request, review step, demo or issue.
 */
describe('an analysis card finishes with finish_analysis (C-503, e2e)', () => {
  const w = new BoardWorld();
  let router: LocalRequestRouter;
  let nextId = 0;

  beforeAll(async () => {
    await w.init();
    router = w.ctx.app.get(LocalRequestRouter);
  });
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    await w.ctx.prisma.runner.update({
      where: { id: w.runnerId },
      data: { localUserId: w.operatorId },
    });
  });
  afterEach(() => w.work.settled());

  /** A local request as the runner relays it, answered by the router. */
  const ask = (
    method: string,
    args: unknown,
    sessionId = ANALYSIS_SESSION,
  ): Promise<LocalResponseMessage> => {
    nextId += 1;
    return router.answer(w.runnerId, {
      type: 'local.request',
      id: `lr_${nextId}`,
      method,
      args,
      projectId: w.a,
      session: { runtime: 'claude', id: sessionId },
      via: 'mcp',
    });
  };

  /** A card in progress with a running round, worked by `sessionId`. */
  const seedCard = async (
    number: number,
    kind: 'analysis' | 'feature',
    sessionId: string,
  ) => {
    const now = new Date();
    const run = await w.ctx.prisma.run.create({
      data: {
        kind: 'card',
        projectId: w.a,
        status: 'running',
        model: 'sonnet',
        triggeredByType: 'user',
        startedAt: now,
        updatedAt: now,
      },
    });
    const card = await w.ctx.prisma.boardCard.create({
      data: {
        projectId: w.a,
        number,
        shortId: `abcd123${number}`,
        title: 'Why is the fleet page slow',
        kind,
        kindSource: 'person',
        column: 'in_progress',
        position: 0,
        issueOnRun: false,
        specOnRun: false,
        sessionId,
        branch: `card/c${number}-why-is-the-fleet-page-slow`,
        model: 'sonnet',
        movedAt: now,
        rounds: {
          create: {
            round: 1,
            runId: run.id,
            trigger: 'run',
            phase: 'running',
            cardTitle: 'Why is the fleet page slow',
            cardBody: '',
            cardKind: kind,
          },
        },
      },
    });
    return { card, run };
  };

  /** The person's feedback started round `round`: the card is back at work. */
  const feedbackRound = async (cardId: string, round: number) => {
    const now = new Date();
    const run = await w.ctx.prisma.run.create({
      data: {
        kind: 'card',
        projectId: w.a,
        status: 'running',
        model: 'sonnet',
        triggeredByType: 'user',
        startedAt: now,
        updatedAt: now,
      },
    });
    await w.ctx.prisma.boardCard.update({
      where: { id: cardId },
      data: {
        column: 'in_progress',
        movedAt: now,
        rounds: {
          create: {
            round,
            runId: run.id,
            trigger: 'feedback',
            feedback: 'Look at the queue too.',
            phase: 'running',
            cardTitle: 'Why is the fleet page slow',
            cardBody: '',
            cardKind: 'analysis',
          },
        },
      },
    });
    return run;
  };

  const proposals = (cardId: string) =>
    w.ctx.prisma.boardCardProposal.findMany({
      where: { cardId },
      orderBy: [{ createdAt: 'asc' }, { position: 'asc' }],
    });

  it('stores the report and the proposals, finishes the card and collects nothing', async () => {
    const { card, run } = await seedCard(1, 'analysis', ANALYSIS_SESSION);
    const answer = await ask('card.finishAnalysis', {
      report: REPORT,
      proposals: [
        proposal({ labels: ['perf'] }),
        proposal({ title: 'Cache the queue', kind: 'task', dependsOn: [0] }),
      ],
    });
    expect([answer.ok, answer.data]).toEqual([
      true,
      { number: 1, finished: true, proposals: 2 },
    ]);
    await w.work.settled();

    const after = await w.card(1);
    expect(after).toMatchObject({ column: 'finished', collectState: 'none' });
    expect(after.rounds[0]).toMatchObject({
      phase: 'finished',
      finishedBy: 'worker',
      report: REPORT,
      summary: 'Two gaps in the fleet page.',
    });
    expect(await proposals(card.id)).toMatchObject([
      {
        roundId: after.rounds[0].id,
        position: 0,
        kind: 'feature',
        labels: ['perf'],
        dependsOn: [],
        status: 'pending',
      },
      {
        position: 1,
        title: 'Cache the queue',
        kind: 'task',
        labels: [],
        dependsOn: [0],
        status: 'pending',
      },
    ]);
    // No pull request, review step, demo or issue follows an analysis.
    expect(w.sent('card.collect')).toEqual([]);
    expect(w.reviews()).toEqual([]);
    expect(w.demosSent()).toEqual([]);
    expect(w.issues()).toEqual([]);
    const audit = await w.audit('card.finished');
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toMatchObject({ proposals: 2 });
    // The daemon's guard did not flag the round.
    expect(
      (await w.ctx.prisma.run.findUniqueOrThrow({ where: { id: run.id } }))
        .readOnlyViolation,
    ).toBe(false);
  });

  it('replaces only the pending proposals on a finish after a feedback round', async () => {
    const { card } = await seedCard(1, 'analysis', ANALYSIS_SESSION);
    await ask('card.finishAnalysis', {
      report: REPORT,
      proposals: [
        proposal({ title: 'First' }),
        proposal({ title: 'Second' }),
        proposal({ title: 'Third' }),
      ],
    });
    await w.work.settled();
    const first = await proposals(card.id);
    await w.ctx.prisma.boardCardProposal.update({
      where: { id: first[0].id },
      data: { status: 'dismissed', decidedAt: new Date() },
    });
    const created = await w.createCard({ title: 'First' });
    await w.ctx.prisma.boardCardProposal.update({
      where: { id: first[1].id },
      data: {
        status: 'created',
        createdCardId: created.id,
        decidedAt: new Date(),
      },
    });
    await feedbackRound(card.id, 2);

    const answer = await ask('card.finishAnalysis', {
      report: 'The queue is fine.',
      proposals: [proposal({ title: 'Fourth', kind: 'bug' })],
    });
    expect(answer.data).toEqual({ number: 1, finished: true, proposals: 1 });
    await w.work.settled();

    const after = await w.card(1);
    expect(after.column).toBe('finished');
    expect(after.rounds[1]).toMatchObject({
      phase: 'finished',
      report: 'The queue is fine.',
    });
    expect(after.rounds[0].report).toBe(REPORT);
    expect(
      (await proposals(card.id)).map((p) => [p.title, p.status, p.roundId]),
    ).toEqual([
      ['First', 'dismissed', after.rounds[0].id],
      ['Second', 'created', after.rounds[0].id],
      ['Fourth', 'pending', after.rounds[1].id],
    ]);
  });

  it('stores a read-only violation the daemon reports on the round’s run', async () => {
    const { run } = await seedCard(1, 'analysis', ANALYSIS_SESSION);
    const answer = await ask('card.finishAnalysis', {
      report: REPORT,
      proposals: [],
      readOnlyViolation: true,
    });
    expect(answer.data).toEqual({ number: 1, finished: true, proposals: 0 });
    expect(
      (await w.ctx.prisma.run.findUniqueOrThrow({ where: { id: run.id } }))
        .readOnlyViolation,
    ).toBe(true);
  });

  it('refuses a dependsOn on a later position and 21 proposals, and changes nothing', async () => {
    const { card } = await seedCard(1, 'analysis', ANALYSIS_SESSION);
    for (const args of [
      { report: REPORT, proposals: [proposal({ dependsOn: [1] }), proposal()] },
      { report: REPORT, proposals: [proposal({ dependsOn: [7] })] },
      {
        report: REPORT,
        proposals: Array.from({ length: 21 }, (_, i) =>
          proposal({ title: `Task ${i}` }),
        ),
      },
    ]) {
      const answer = await ask('card.finishAnalysis', args);
      expect([answer.ok, answer.error?.code]).toEqual([false, 'invalid_args']);
    }
    const after = await w.card(1);
    expect(after.column).toBe('in_progress');
    expect(after.rounds[0].phase).toBe('running');
    expect(await proposals(card.id)).toEqual([]);
  });

  it('refuses finish_card from an analysis session and finish_analysis from a feature card’s', async () => {
    await seedCard(1, 'analysis', ANALYSIS_SESSION);
    await seedCard(2, 'feature', FEATURE_SESSION);
    const finish = await ask('card.finish', { summary: 'Done.' });
    expect([finish.ok, finish.error?.code]).toEqual([
      false,
      'analysis_expected',
    ]);
    const analysis = await ask(
      'card.finishAnalysis',
      { report: REPORT, proposals: [] },
      FEATURE_SESSION,
    );
    expect([analysis.ok, analysis.error?.code]).toEqual([
      false,
      'not_a_card_session',
    ]);
    expect((await w.card(1)).column).toBe('in_progress');
    expect((await w.card(2)).column).toBe('in_progress');
    expect(w.sent('card.collect')).toEqual([]);
  });

  it('shows the analysis in the card detail to project members only', async () => {
    const { card } = await seedCard(1, 'analysis', ANALYSIS_SESSION);
    await ask('card.finishAnalysis', {
      report: REPORT,
      proposals: [proposal({ labels: ['perf'] })],
    });
    await w.work.settled();
    const origin = await w.createCard({ title: 'Index the runs table' });
    await w.ctx.prisma.boardCard.update({
      where: { id: origin.id },
      data: { originCardId: card.id },
    });

    const url = `${w.path()}/board/cards/1`;
    for (const session of [w.operator, w.viewer]) {
      const response = await session.get(url);
      expect(response.status).toBe(200);
      const detail = response.body as BoardCardDetail;
      expect(detail.kind).toBe('analysis');
      expect(detail.origin).toBeNull();
      expect(detail.analysis).toMatchObject({
        report: REPORT,
        proposals: [
          {
            position: 0,
            title: 'Index the runs table by project',
            kind: 'feature',
            labels: ['perf'],
            dependsOn: [],
            status: 'pending',
          },
        ],
      });
    }
    // A card made from the analysis names it; it carries no analysis itself.
    const made = await w.operator.get(
      `${w.path()}/board/cards/${origin.number}`,
    );
    expect(made.body).toMatchObject({
      analysis: null,
      origin: { number: 1, title: 'Why is the fleet page slow' },
    });
    for (const session of [w.outsider, w.operatorOfB]) {
      expect((await session.get(url)).status).toBe(404);
    }
  });
});
