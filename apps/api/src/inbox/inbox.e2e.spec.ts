import { randomUUID } from 'node:crypto';
import type { InboxView, PendingQuestion } from '@nautelle/shared';
import type { Prisma } from '@prisma/client';
import type { Session } from '../test/e2e-app';
import { at, WorkWorld } from '../work/testing/work-e2e';

const QUESTION: PendingQuestion = {
  key: '0123456789abcdef',
  header: 'glass-ui',
  text: 'SelectionBar is missing in glass-ui — what now?',
  options: [
    { index: 1, label: 'Add it to glass-ui' },
    { index: 2, label: 'Use a Toolbar' },
  ],
  other: true,
};

/** `GET /inbox` (C-390, ADR-0102): what waits on the caller, across projects. */
describe('inbox (e2e)', () => {
  const w = new WorkWorld();
  const inbox = async (session: Session): Promise<InboxView> => {
    const response = await session.get('/inbox');
    expect(response.status).toBe(200);
    return response.body as InboxView;
  };
  /** `<project>:<item id without the card's cuid>`, the card's number instead. */
  const rows = (
    view: InboxView,
    kinds = ['question', 'merge', 'design', 'failed', 'permission'],
  ) =>
    view.items
      .filter((i) => kinds.includes(i.kind))
      .map((i) => {
        const project = i.projectId === w.a ? 'A' : 'B';
        if (i.kind === 'permission')
          return `${project}:permission:${i.request.summary}`;
        if (i.kind === 'setup') return `${project}:setup:${i.blocker.code}`;
        return `${project}:${i.kind}:C-${i.card.number}`;
      });

  /** Updates a card and keeps its seeded `updatedAt`, so order stays exact. */
  const update = async (id: string, data: Prisma.BoardCardUpdateInput) => {
    const { updatedAt } = await w.ctx.prisma.boardCard.findUniqueOrThrow({
      where: { id },
      select: { updatedAt: true },
    });
    return w.ctx.prisma.boardCard.update({
      where: { id },
      data: { ...data, updatedAt },
    });
  };

  /** A round of the card, in `phase`; `pendingQuestion` set when given. */
  const round = async (
    cardId: string,
    phase: 'running' | 'waiting' | 'failed',
    question?: PendingQuestion,
  ) => {
    const { projectId } = await w.ctx.prisma.boardCard.findUniqueOrThrow({
      where: { id: cardId },
      select: { projectId: true },
    });
    const run = await w.ctx.prisma.run.create({
      data: {
        id: randomUUID(),
        kind: 'card',
        projectId,
        status: question ? 'waiting_person' : 'running',
        triggeredByType: 'user',
        startedAt: at(0),
        updatedAt: at(0),
      },
    });
    return w.ctx.prisma.boardCardRound.create({
      data: {
        cardId,
        round: 1,
        runId: run.id,
        trigger: 'run',
        cardTitle: 'Card',
        cardBody: '',
        cardKind: 'feature',
        phase,
        pendingQuestion: question
          ? (question as unknown as Prisma.InputJsonValue)
          : undefined,
        waitingAt: question ? at(3) : null,
        error: phase === 'failed' ? 'The worker exited.' : null,
        endedAt: phase === 'failed' ? at(3) : null,
      },
    });
  };

  const request = async (
    project: string,
    summary: string,
    createdAt: Date,
    extra: Partial<Prisma.ActionRequestUncheckedCreateInput> = {},
  ) => {
    const { runnerId } = await w.ctx.prisma.project.findUniqueOrThrow({
      where: { id: project },
      select: { runnerId: true },
    });
    return w.ctx.prisma.actionRequest.create({
      data: {
        projectId: project,
        runnerId,
        kind: 'tool_use',
        summary,
        args: { tool: 'Bash', input: { command: 'ls' } },
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt,
        ...extra,
      },
    });
  };

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());

  it('needs a signed-in caller', async () => {
    expect((await w.ctx.http().get('/inbox')).status).toBe(401);
  });

  it('lists every kind of card item, oldest first, and skips what waits on nobody', async () => {
    // C-1: a question of the running round.
    const question = await w.card({
      project: w.a,
      number: 1,
      column: 'in_progress',
      updatedAt: at(1),
    });
    await round(question, 'waiting', QUESTION);
    // C-2: Finished with an open PR — ready to merge.
    const merge = await w.card({
      project: w.a,
      number: 2,
      column: 'finished',
      updatedAt: at(2),
    });
    await update(merge, {
      branch: 'card/c2',
      prNumber: 12,
      prUrl: 'https://github.com/o/r/pull/12',
      prState: 'open',
      collectState: 'ok',
    });
    // C-3: CI fix rounds exhausted.
    const person = await w.card({
      project: w.a,
      number: 3,
      column: 'finished',
      updatedAt: at(4),
    });
    await update(person, {
      branch: 'card/c3',
      prNumber: 13,
      prUrl: 'https://github.com/o/r/pull/13',
      prState: 'open',
      needsPerson: true,
      needsPersonReason: 'ci_still_failing',
    });
    // C-4: a design waiting for approval.
    const design = await w.card({
      project: w.a,
      number: 4,
      updatedAt: at(5),
    });
    await w.ctx.prisma.taskDesign.create({
      data: { cardId: design, needed: true, status: 'reviewing' },
    });
    // C-5: a collect that failed.
    const collect = await w.card({
      project: w.a,
      number: 5,
      column: 'finished',
      updatedAt: at(6),
    });
    await update(collect, {
      branch: 'card/c5',
      collectState: 'failed',
      collectError: 'push rejected: protected branch',
    });
    // Waits on nobody: a plain To Do card, a running round, a merged card,
    // a Completed card and a fleet card with a question.
    await w.card({ project: w.a, number: 6, updatedAt: at(0) });
    const running = await w.card({
      project: w.a,
      number: 7,
      column: 'in_progress',
      updatedAt: at(0),
    });
    await round(running, 'running');
    const merged = await w.card({
      project: w.a,
      number: 8,
      column: 'finished',
      updatedAt: at(0),
    });
    await update(merged, {
      prNumber: 18,
      prState: 'merged',
      mergedAt: at(0),
    });
    await w.card({
      project: w.a,
      number: 9,
      column: 'completed',
      updatedAt: at(0),
    });
    const fleet = await w.card({
      project: w.a,
      number: 10,
      column: 'in_progress',
      updatedAt: at(0),
      fleet: { issue: 77, slot: 's1' },
    });
    await round(fleet, 'waiting', QUESTION);

    const view = await inbox(w.operator);
    expect(rows(view)).toEqual([
      'A:merge:C-2',
      'A:question:C-1',
      'A:failed:C-3',
      'A:design:C-4',
      'A:failed:C-5',
    ]);
    const [, ask, ci, , pushed] = view.items.filter((i) => i.kind !== 'setup');
    expect(ask).toMatchObject({
      kind: 'question',
      card: { round: { pendingQuestion: QUESTION } },
    });
    expect(ci).toMatchObject({
      kind: 'failed',
      reason: 'ci_still_failing',
      retry: 'run',
    });
    expect(pushed).toMatchObject({
      kind: 'failed',
      reason: 'collect_failed',
      message: 'push rejected: protected branch',
      retry: 'collect',
    });
    expect(view.counts).toMatchObject({
      question: 1,
      merge: 1,
      design: 1,
      failed: 2,
      permission: 0,
    });
    expect(view.total).toBe(view.items.length);
  });

  it('a handled item is gone on the next read', async () => {
    const card = await w.card({
      project: w.a,
      number: 1,
      column: 'finished',
      updatedAt: at(1),
    });
    await update(card, { prNumber: 11, prState: 'open', branch: 'card/c1' });
    expect(rows(await inbox(w.operator))).toEqual(['A:merge:C-1']);
    await update(card, { prState: 'merged', mergedAt: at(2) });
    expect(rows(await inbox(w.operator))).toEqual([]);
  });

  it('lists the pending tool-use requests the caller may decide', async () => {
    await request(w.a, 'Bash: ls', at(1));
    await request(w.a, 'Bash: rm', at(2), { status: 'denied' });
    await request(w.a, 'Bash: old', at(0), {
      expiresAt: new Date(Date.now() - 1000),
    });
    // A requester never approves their own fleet start (D18): it waits on
    // another operator.
    await request(w.a, 'Start the fleet', at(3), {
      kind: 'orchestrator_start',
      requestedById: w.authorId,
    });
    await request(w.b, 'Bash: pwd', at(4));

    expect(rows(await inbox(w.author))).toEqual(['A:permission:Bash: ls']);
    expect(rows(await inbox(w.operator))).toEqual([
      'A:permission:Bash: ls',
      'A:permission:Start the fleet',
    ]);
    expect(rows(await inbox(w.admin))).toEqual([
      'A:permission:Bash: ls',
      'A:permission:Start the fleet',
      'B:permission:Bash: pwd',
    ]);
  });

  it('only projects the caller operates contribute', async () => {
    for (const project of [w.a, w.b]) {
      const card = await w.card({
        project,
        number: 1,
        column: 'finished',
        updatedAt: at(1),
      });
      await update(card, { prNumber: 11, prState: 'open', branch: 'card/c1' });
    }
    expect(rows(await inbox(w.mixed))).toEqual(['A:merge:C-1']);
    expect((await inbox(w.mixed)).projects.map((p) => p.id)).toEqual([w.a]);
    expect(await inbox(w.viewer)).toMatchObject({ items: [], total: 0 });
    expect(await inbox(w.outsider)).toMatchObject({ items: [], total: 0 });
    expect(rows(await inbox(w.admin)).sort()).toEqual([
      'A:merge:C-1',
      'B:merge:C-1',
    ]);
  });

  it('lists the Run blockers of a project only while it has open cards', async () => {
    expect((await inbox(w.operator)).counts.setup).toBe(0);
    await w.card({ project: w.a, number: 1, updatedAt: at(1) });
    const view = await inbox(w.operator);
    const setup = view.items.filter((i) => i.kind === 'setup');
    expect(setup.length).toBeGreaterThan(0);
    expect(view.counts.setup).toBe(setup.length);
    for (const item of setup) {
      expect(item.id).toBe(`setup:${w.a}:${item.blocker.code}`);
    }
  });
});
