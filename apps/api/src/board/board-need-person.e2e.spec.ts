import type { BoardStackDetail } from '@nautelle/shared';
import { capabilities } from '../runners/testing/runner-e2e';
import { BoardRoundsService, CardTaskOpen } from './board-rounds.service';
import { BoardWorld } from './testing/board-e2e';

/**
 * C-511: a card worker's `need_person` raises a task for a person, the card
 * waits for it in To Do with its session, and resumes that session with the
 * checklist and the note once the task is Done.
 */
describe('need_person (e2e, C-511)', () => {
  const w = new BoardWorld();
  let rounds: BoardRoundsService;

  beforeAll(async () => {
    await w.init();
    rounds = w.ctx.app.get(BoardRoundsService);
  });
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const cardPath = (number: number) => `${w.path()}/board/cards/${number}`;

  const advertise = (cardNeedPerson = true) =>
    w.ctx.prisma.runner.update({
      where: { id: w.runnerId },
      data: { capabilities: { ...capabilities, cardNeedPerson } },
    });

  const ask = async (number: number, checklist?: string[]) => {
    const card = await w.card(number);
    return rounds.needPersonByWorker(
      { id: w.a, runnerId: w.runnerId },
      card.sessionId ?? '',
      {
        title: 'Add the STRIPE_KEY secret',
        why: 'The payment test needs a real test key.',
        ...(checklist ? { checklist } : {}),
      },
    );
  };

  const taskOf = (number: number) =>
    w.ctx.prisma.boardCard.findFirstOrThrow({
      where: { projectId: w.a, raisedForCard: { number } },
      include: { checklist: { orderBy: { position: 'asc' } } },
    });

  /** The resume starts unawaited after Done; wait for its `card.run`. */
  const runs = async (count: number) => {
    for (let i = 0; i < 250; i += 1) {
      await w.work.settled();
      if (w.sent('card.run').length >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`expected ${count} card.run commands`);
  };

  it('offers need_person only to a runner that advertises it', async () => {
    const { number } = await w.createCard({ specOnRun: false });
    await w.runCard(number);
    expect(w.sent('card.run')[0]).not.toHaveProperty('needPerson');
    expect(String(w.sent('card.run')[0].prompt)).not.toContain('need_person');

    await advertise();
    const other = await w.createCard({ specOnRun: false });
    await w.runCard(other.number);
    expect(w.sent('card.run')[1]).toMatchObject({ needPerson: true });
    expect(String(w.sent('card.run')[1].prompt)).toContain('need_person');
  });

  it('raises a task for the round’s author, waits in To Do with its session and resumes it after Done', async () => {
    await advertise();
    const { number } = await w.createCard({ specOnRun: false });
    expect((await w.runCard(number)).status).toBe(200);
    const before = await w.card(number);

    const raised = await ask(number, [
      'Create a test key',
      'Add it to the env',
    ]);
    const task = await taskOf(number);
    expect(raised).toEqual({ number, task: task.number });
    expect(task).toMatchObject({
      kind: 'task',
      column: 'todo',
      title: 'Add the STRIPE_KEY secret',
      body: 'The payment test needs a real test key.',
      assigneeId: w.operatorId,
      createdById: w.operatorId,
    });
    expect(task.checklist.map((i) => i.text)).toEqual([
      'Create a test key',
      'Add it to the env',
    ]);
    const waiting = await w.card(number);
    expect(waiting).toMatchObject({
      column: 'todo',
      sessionId: before.sessionId,
      autoRunWhenReady: true,
      autoRunArmedById: w.operatorId,
    });
    expect(waiting.position).toBeLessThan(task.position);
    expect(waiting.rounds[0]).toMatchObject({
      phase: 'finished',
      finishedBy: 'worker',
      summary: `Raised C-${task.number} for a person: Add the STRIPE_KEY secret`,
    });
    const dependency = await w.ctx.prisma.boardCardDependency.findFirst({
      where: { cardId: waiting.id, dependsOnId: task.id },
    });
    expect(dependency).not.toBeNull();
    await w.work.settled();
    expect(w.sent('card.collect')).toEqual([]);
    expect(w.sent('card.run')).toHaveLength(1);
    const [audit] = await w.audit('card.task_raised');
    expect(audit.after).toMatchObject({
      number,
      task: task.number,
      assigneeId: w.operatorId,
      checklist: 2,
      resume: 'auto_run',
    });

    // The assignee ticks one item and marks the task Done with a note.
    await w.ctx.prisma.boardCardChecklistItem.update({
      where: { id: task.checklist[0].id },
      data: { doneAt: new Date() },
    });
    const done = await w.operator.send(
      'post',
      `${cardPath(task.number)}/done`,
      {
        note: 'The key is in apps/api/.env.',
      },
    );
    expect(done.status).toBe(200);
    await runs(2);
    const resume = w.sent('card.run')[1];
    expect(resume).toMatchObject({
      cardId: waiting.id,
      session: { resume: true },
    });
    const prompt = String(resume.prompt);
    expect(prompt).toContain(`C-${task.number} you raised with need_person`);
    expect(prompt).toContain('- [x] Create a test key');
    expect(prompt).toContain('- [ ] Add it to the env');
    expect(prompt).toContain('Note: The key is in apps/api/.env.');
    const resumed = await w.card(number);
    expect(resumed).toMatchObject({
      column: 'in_progress',
      sessionId: before.sessionId,
    });
    expect(resumed.rounds.map((r) => r.trigger)).toEqual(['run', 'task_done']);
  });

  it('keeps a stack run going and resumes the card through its entry', async () => {
    await advertise();
    const a = await w.createCard({ title: 'Part A', specOnRun: false });
    const stacks = `${w.path()}/board/stacks`;
    expect(
      (
        await w.operator.send('post', stacks, {
          title: 'Payments',
          cards: [a.number],
        })
      ).status,
    ).toBe(201);
    expect((await w.operator.send('post', `${stacks}/1/run`, {})).status).toBe(
      200,
    );
    await runs(1);

    await ask(a.number);
    await w.work.settled();
    const task = await taskOf(a.number);
    const run = await w.ctx.prisma.boardStackRun.findFirstOrThrow({
      include: { cards: true },
    });
    expect(run.state).toBe('running');
    expect(run.cards.map((e) => [e.cardId, e.status])).toEqual([
      [a.id, 'waiting'],
    ]);
    const waiting = await w.card(a.number);
    expect(waiting).toMatchObject({ column: 'todo', autoRunWhenReady: false });
    const stack = (await w.viewer.get(`${stacks}/1`)).body as BoardStackDetail;
    expect(stack.run?.state).toBe('running');
    const [audit] = await w.audit('card.task_raised');
    expect(audit.after).toMatchObject({ resume: 'stack_run' });

    const done = await w.operator.send(
      'post',
      `${cardPath(task.number)}/done`,
      {},
    );
    expect(done.status).toBe(200);
    await runs(2);
    expect(w.sent('card.run')).toHaveLength(2);
    expect(w.sent('card.run')[1]).toMatchObject({
      cardId: a.id,
      session: { resume: true },
    });
    expect(String(w.sent('card.run')[1].prompt)).toContain('Note: (none)');
    const resumed = await w.card(a.number);
    expect(resumed.sessionId).toBe(waiting.sessionId);
    expect(resumed.rounds.map((r) => r.trigger)).toEqual(['run', 'task_done']);
  });

  it('refuses a second task while the first is open', async () => {
    await advertise();
    const { number } = await w.createCard({ specOnRun: false });
    await w.runCard(number);
    await ask(number);
    // A person runs the card anyway; its worker asks again.
    expect((await w.runCard(number)).status).toBe(200);
    expect((await w.card(number)).rounds[1].trigger).toBe('run');
    await expect(ask(number)).rejects.toBeInstanceOf(CardTaskOpen);
    expect(
      await w.ctx.prisma.boardCard.count({ where: { kind: 'task' } }),
    ).toBe(1);
  });

  it('answers null for a session that is not a card round', async () => {
    const project = { id: w.a, runnerId: w.runnerId };
    const input = { title: 'Add the key', why: 'Needed.' };
    expect(
      await rounds.needPersonByWorker(project, 'sess-manual-1', input),
    ).toBe(null);
    expect(
      await rounds.needPersonByWorker(
        project,
        '0b0f6f2e-8f5e-4c1e-9a43-3d6f3b1f2c11',
        input,
      ),
    ).toBe(null);
    // A card whose round is over has no worker to ask.
    const { number } = await w.createCard({ specOnRun: false });
    await w.runCard(number);
    await w.operator.send('post', `${cardPath(number)}/stop`, {});
    expect(await ask(number)).toBe(null);
    expect(
      await w.ctx.prisma.boardCard.count({ where: { kind: 'task' } }),
    ).toBe(0);
  });

  it('gives the task to the oldest admin when the author left the project', async () => {
    await advertise();
    const { number } = await w.createCard({ specOnRun: false });
    await w.runCard(number);
    await w.ctx.prisma.projectMember.deleteMany({
      where: { projectId: w.a, userId: w.operatorId },
    });
    await ask(number);
    const admin = await w.ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'admin@x.test' },
    });
    expect((await taskOf(number)).assigneeId).toBe(admin.id);
  });
});
