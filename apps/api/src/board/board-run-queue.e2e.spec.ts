import {
  BOARD_ERROR,
  type BoardCardDetail,
  type BoardCardView,
  type BoardView,
} from '@nautelle/shared';
import { BoardRunQueue } from './board-run-queue';
import { BoardWorld } from './testing/board-e2e';

/**
 * C-398 (docs/specs/card-398-run-queue-at-the-worker-limit-a-card-wai.md,
 * ADR-0101): Run on a full Board puts a To Do card in the run queue instead
 * of refusing it. When a slot frees, the topmost queued card in To Do order
 * starts; dragging a card reorders the queue. A queued card whose dependency
 * is not ready waits without holding the others, and Stop takes a card out.
 */
describe('run queue (e2e, C-398)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const cardPath = (number: number) => `${w.path()}/board/cards/${number}`;
  const maxRunning = (value: number) =>
    w.admin.send('put', `${w.path()}/board-settings`, {
      issueOnRun: false,
      specOnRun: false,
      maxRunning: value,
    });
  const move = (number: number, index: number) =>
    w.operator.send('post', `${cardPath(number)}/move`, {
      column: 'todo',
      index,
    });
  const board = async () =>
    (await w.viewer.get(`${w.path()}/board`)).body as BoardView;
  const face = async (number: number): Promise<BoardCardView | undefined> =>
    (await board()).columns
      .flatMap((c) => c.cards)
      .find((c) => c.number === number);
  const detail = async (number: number) =>
    (await w.viewer.get(cardPath(number))).body as BoardCardDetail;

  /** `count` new cards, each moved to the bottom of To Do: To Do order is the order made. */
  const cards = async (count: number) => {
    const made: { id: string; number: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const card = await w.createCard({
        title: `Part ${i + 1}`,
        specOnRun: false,
      });
      expect((await move(card.number, 1_000_000)).status).toBe(200);
      made.push(card);
    }
    return made;
  };

  /** The numbers of the cards a `card.run` was sent for, in order. */
  const started = async () => {
    const ids = w.sent('card.run').map((args) => String(args.cardId));
    const rows = await w.ctx.prisma.boardCard.findMany({
      where: { id: { in: ids } },
      select: { id: true, number: true },
    });
    const byId = new Map(rows.map((c) => [c.id, c.number]));
    return ids.map((id) => byId.get(id));
  };

  /** The card's round finishes and the card lands in Finished, as the runner's events do. */
  const finishRound = async (card: { id: string; number: number }) => {
    const round = await w.ctx.prisma.boardCardRound.findFirstOrThrow({
      where: { cardId: card.id },
      orderBy: { round: 'desc' },
    });
    await w.ctx.prisma.boardCardRound.update({
      where: { id: round.id },
      data: { phase: 'finished', finishedAt: new Date() },
    });
    await w.ctx.prisma.boardCard.update({
      where: { id: card.id },
      data: { column: 'finished' },
    });
    w.work.publish(w.a, card.id);
    await w.work.settled();
  };

  it('runs 5 cards on 3 slots: 3 start, the other 2 wait and start in To Do order as slots free', async () => {
    await maxRunning(3);
    const [c1, c2, c3, c4, c5] = await cards(5);

    for (const card of [c1, c2, c3]) {
      const ran = await w.runCard(card.number);
      expect(ran.status).toBe(200);
      expect((ran.body as BoardCardDetail).queue).toBeNull();
    }
    const fourth = await w.runCard(c4.number);
    expect(fourth.status).toBe(200);
    expect((fourth.body as BoardCardDetail).queue).toEqual({
      state: 'queued',
      place: 1,
      stack: null,
    });
    expect((await w.runCard(c5.number)).status).toBe(200);
    expect(await started()).toEqual([c1.number, c2.number, c3.number]);

    const shown = await board();
    expect(shown.queued).toBe(2);
    expect((await face(c4.number))?.queue).toMatchObject({ place: 1 });
    expect((await face(c5.number))?.queue).toMatchObject({ place: 2 });
    expect((await face(c5.number))?.column).toBe('todo');
    expect((await face(c5.number))?.autoRunFailure).toBeNull();
    const queued = await w.audit('card.run_queued');
    expect(queued.map((a) => a.after)).toEqual([
      expect.objectContaining({ number: c4.number }),
      expect.objectContaining({ number: c5.number }),
    ]);

    await finishRound(c2);
    expect(await started()).toEqual([
      c1.number,
      c2.number,
      c3.number,
      c4.number,
    ]);
    expect((await detail(c4.number)).queue).toBeNull();
    expect((await face(c5.number))?.queue).toMatchObject({ place: 1 });

    await finishRound(c1);
    expect(await started()).toEqual([
      c1.number,
      c2.number,
      c3.number,
      c4.number,
      c5.number,
    ]);
    expect((await board()).queued ?? 0).toBe(0);
    expect(await w.ctx.prisma.boardRunQueueCard.count()).toBe(0);
  });

  it('starts the topmost queued card after a reorder', async () => {
    await maxRunning(1);
    const [a, b, c] = await cards(3);
    for (const card of [a, b, c]) {
      expect((await w.runCard(card.number)).status).toBe(200);
    }
    expect((await face(b.number))?.queue).toMatchObject({ place: 1 });
    expect((await face(c.number))?.queue).toMatchObject({ place: 2 });

    // Dragging C to the top of To Do puts it first in the queue.
    expect((await move(c.number, 0)).status).toBe(200);
    expect((await face(c.number))?.queue).toMatchObject({ place: 1 });
    expect((await face(b.number))?.queue).toMatchObject({ place: 2 });

    await finishRound(a);
    expect(await started()).toEqual([a.number, c.number]);
    expect((await face(b.number))?.queue).toMatchObject({ place: 1 });
  });

  it('Stop takes a queued card out of the queue without a worker command', async () => {
    await maxRunning(1);
    const [a, b] = await cards(2);
    expect((await w.runCard(a.number)).status).toBe(200);
    expect((await w.runCard(b.number)).status).toBe(200);
    expect((await face(b.number))?.queue).not.toBeNull();

    const stopped = await w.operator.send('post', `${cardPath(b.number)}/stop`);
    expect(stopped.status).toBe(200);
    expect(w.sent('card.stop')).toEqual([]);
    expect((await face(b.number))?.queue).toBeNull();
    const [audit] = await w.audit('card.run_dequeued');
    expect(audit).toMatchObject({ result: 'ok', after: { number: b.number } });

    await finishRound(a);
    expect(await started()).toEqual([a.number]);
    expect((await face(b.number))?.column).toBe('todo');
  });

  it('a queued card whose dependency is not ready waits and lets the next one start', async () => {
    await maxRunning(1);
    const [busy, a, b, dep] = await cards(4);
    expect((await w.runCard(busy.number)).status).toBe(200);
    expect((await w.runCard(a.number)).status).toBe(200);
    expect((await w.runCard(b.number)).status).toBe(200);
    const linked = await w.operator.send(
      'post',
      `${cardPath(a.number)}/dependencies`,
      { dependsOn: dep.number },
    );
    expect(linked.status).toBe(200);

    await finishRound(busy);
    expect(await started()).toEqual([busy.number, b.number]);
    const waiting = await face(a.number);
    expect(waiting?.queue).toEqual({
      state: 'waiting',
      place: null,
      stack: null,
    });
    expect(waiting?.autoRunFailure).toBeNull();
    expect(await w.audit('card.auto_run_failed')).toEqual([]);
  });

  it('a card outside To Do is still refused at the limit', async () => {
    await maxRunning(1);
    const [a, b] = await cards(2);
    expect((await w.runCard(a.number)).status).toBe(200);
    await finishRound(a);
    expect((await w.runCard(b.number)).status).toBe(200);

    const again = await w.runCard(a.number);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe(BOARD_ERROR.maxRunning);
    expect(await w.ctx.prisma.boardRunQueueCard.count()).toBe(0);
  });

  it('keeps the options of the Run and resumes a persisted queue after a restart', async () => {
    await maxRunning(1);
    await w.advertiseCardEffort();
    const [a, b] = await cards(2);
    expect((await w.runCard(a.number)).status).toBe(200);
    const queued = await w.runCard(b.number, {
      model: 'sonnet',
      effort: 'high',
    });
    expect((queued.body as BoardCardDetail).queue).not.toBeNull();

    // The slot frees while nothing listens, as across a restart.
    await w.ctx.prisma.boardCardRound.updateMany({
      where: { cardId: a.id },
      data: { phase: 'finished', finishedAt: new Date() },
    });
    expect(await started()).toEqual([a.number]);

    await w.ctx.app.get(BoardRunQueue).resumeAll();
    expect(await started()).toEqual([a.number, b.number]);
    const [round] = (await w.card(b.number)).rounds;
    expect(round).toMatchObject({
      authorId: w.operatorId,
      model: 'sonnet',
      effort: 'high',
    });
    expect(await w.ctx.prisma.boardRunQueueCard.count()).toBe(0);
  });
});
