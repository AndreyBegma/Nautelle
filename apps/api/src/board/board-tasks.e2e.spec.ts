import {
  BOARD_ERROR,
  type BoardCardDetail,
  type BoardCardView,
  type BoardStackDetail,
  type BoardView,
} from '@nautelle/shared';
import { createUser, login } from '../test/e2e-app';
import { BoardWorld } from './testing/board-e2e';

/** C-509 (ADR-0127): a task card — done by a person, waited on as any card. */
describe('task cards (e2e, C-509)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const cardPath = (number: number) => `${w.path()}/board/cards/${number}`;
  const userId = async (email: string) =>
    (await w.ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const face = async (number: number): Promise<BoardCardView | undefined> => {
    const board = (await w.viewer.get(`${w.path()}/board`)).body as BoardView;
    return board.columns
      .flatMap((c) => c.cards)
      .find((c) => c.number === number);
  };
  const detail = async (number: number) =>
    (await w.viewer.get(cardPath(number))).body as BoardCardDetail;
  const link = (number: number, dependsOn: number) =>
    w.operator.send('post', `${cardPath(number)}/dependencies`, { dependsOn });

  /** A task for the project's viewer, with two checklist items. */
  const task = async (extra: Record<string, unknown> = {}) =>
    w.createCard({
      title: 'Add the Stripe secret',
      body: 'Put the live key in the vault.',
      kind: 'task',
      assigneeId: await userId('viewer@x.test'),
      checklist: ['Create the key', 'Store it in the vault'],
      ...extra,
    });

  describe('create', () => {
    it('makes a task in To Do with its assignee and checklist', async () => {
      const t = await task();
      const shown = await detail(t.number);
      expect(shown).toMatchObject({
        kind: 'task',
        column: 'todo',
        assignee: { id: await userId('viewer@x.test'), name: 'viewer@x.test' },
        checklist: { done: 0, total: 2 },
        taskNote: null,
        raisedFor: null,
      });
      expect(shown.checklistItems?.map((i) => [i.text, i.doneAt])).toEqual([
        ['Create the key', null],
        ['Store it in the vault', null],
      ]);
      expect(await face(t.number)).toMatchObject({
        kind: 'task',
        checklist: { done: 0, total: 2 },
      });
    });

    it('refuses an assignee outside the project with 422 assignee_not_member', async () => {
      const response = await w.operator.send(
        'post',
        `${w.path()}/board/cards`,
        {
          title: 'Add the secret',
          kind: 'task',
          assigneeId: await userId('out@x.test'),
        },
      );
      expect(response.status).toBe(422);
      expect(response.body.error).toBe(BOARD_ERROR.assigneeNotMember);
    });

    it('accepts an admin, who sees every project, as the assignee', async () => {
      const t = await task({ assigneeId: await userId('admin@x.test') });
      expect((await detail(t.number)).assignee?.name).toBe('admin@x.test');
    });

    it('refuses a task without an assignee, a task with code fields and a code card with an assignee', async () => {
      const post = (body: object) =>
        w.operator.send('post', `${w.path()}/board/cards`, {
          title: 'Add the secret',
          ...body,
        });
      const viewer = await userId('viewer@x.test');
      for (const body of [
        { kind: 'task' },
        { kind: 'task', assigneeId: viewer, specOnRun: true },
        { kind: 'feature', assigneeId: viewer },
        { checklist: ['One'] },
      ]) {
        const response = await post(body);
        expect(response.status).toBe(422);
        expect(response.body.error).toBe(BOARD_ERROR.taskField);
      }
    });

    it("refuses a change of a task's kind and of a code card's into a task", async () => {
      const t = await task();
      const code = await w.createCard({ title: 'Add login', kind: 'feature' });
      for (const [number, kind] of [
        [t.number, 'feature'],
        [code.number, 'task'],
      ] as const) {
        const response = await w.operator.send('patch', cardPath(number), {
          kind,
        });
        expect(response.status).toBe(422);
        expect(response.body.error).toBe(BOARD_ERROR.taskField);
      }
      const autoRun = await w.operator.send('patch', cardPath(t.number), {
        autoRunWhenReady: true,
      });
      expect(autoRun.status).toBe(422);
      expect(autoRun.body.error).toBe(BOARD_ERROR.taskField);
    });

    it('reassigns a task to another member', async () => {
      const t = await task();
      const response = await w.operator.send('patch', cardPath(t.number), {
        assigneeId: w.operatorId,
      });
      expect(response.status).toBe(200);
      expect((await detail(t.number)).assignee?.id).toBe(w.operatorId);
    });
  });

  describe('runner work', () => {
    it('refuses Run, Feedback, Create pull request, design and demo with 409 card_is_task', async () => {
      const t = await task();
      const path = cardPath(t.number);
      for (const response of [
        await w.runCard(t.number),
        await w.operator.send('post', `${path}/feedback`, { text: 'Faster' }),
        await w.operator.send('post', `${path}/collect`),
        await w.operator.send('post', `${path}/design/generate`, {}),
        await w.operator.send('post', `${path}/demos`),
      ]) {
        expect(response.status).toBe(409);
        expect(response.body.error).toBe(BOARD_ERROR.cardIsTask);
      }
      expect(w.sent('card.run')).toEqual([]);
      expect((await w.card(t.number)).column).toBe('todo');
    });

    it('refuses a move to Finished with invalid_move', async () => {
      const t = await task();
      const response = await w.operator.send(
        'post',
        `${cardPath(t.number)}/move`,
        {
          column: 'finished',
          index: 0,
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.error).toBe(BOARD_ERROR.invalidMove);
    });

    it('Run stack skips the task and queues its dependant as waiting', async () => {
      const t = await task();
      const b = await w.createCard({ title: 'Part B', specOnRun: false });
      const c = await w.createCard({ title: 'Part C', specOnRun: false });
      const stacks = `${w.path()}/board/stacks`;
      const made = await w.operator.send('post', stacks, {
        title: 'Payments',
        cards: [t.number, b.number],
      });
      expect(made.status).toBe(201);
      const added = await w.operator.send('post', `${stacks}/1/cards`, {
        card: c.number,
        stage: 1,
      });
      expect(added.status).toBe(201);

      const run = await w.operator.send('post', `${stacks}/1/run`, {});
      expect(run.status).toBe(200);
      const ran = w.sent('card.run').map((args) => String(args.cardId));
      expect(ran).toEqual([b.id]);
      const stack = (await w.viewer.get(`${stacks}/1`))
        .body as BoardStackDetail;
      const states = Object.fromEntries(
        stack.stages.flatMap((s) => s.cards).map((x) => [x.number, x.run]),
      );
      expect(states).toEqual({
        [t.number]: null,
        [b.number]: 'running',
        [c.number]: 'waiting',
      });
      expect((await w.card(t.number)).column).toBe('todo');
    });
  });

  describe('Done', () => {
    it('by the assignee moves the task to Completed, keeps the note and readies its dependant', async () => {
      const t = await task();
      const c = await w.createCard({ title: 'Charge cards', specOnRun: false });
      expect((await link(c.number, t.number)).status).toBe(200);
      expect((await face(c.number))?.readiness).toEqual({
        state: 'waiting',
        satisfied: 0,
        total: 1,
        open: [
          {
            number: t.number,
            label: `C-${t.number}`,
            column: 'todo',
            kind: 'task',
            assigneeName: 'viewer@x.test',
          },
        ],
      });

      const done = await w.viewer.send('post', `${cardPath(t.number)}/done`, {
        note: 'Key is in the vault.',
      });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({
        column: 'completed',
        taskNote: 'Key is in the vault.',
      });
      expect((await face(c.number))?.readiness).toMatchObject({
        state: 'ready',
        satisfied: 1,
        total: 1,
      });
      const [audit] = await w.audit('card.task_done');
      expect(audit).toMatchObject({
        result: 'ok',
        after: { number: t.number, note: 'Key is in the vault.' },
      });
      expect(w.sent('card.run')).toEqual([]);
    });

    it('starts a dependant that has Auto-run when ready', async () => {
      const t = await task();
      const c = await w.createCard({ title: 'Charge cards', specOnRun: false });
      expect((await link(c.number, t.number)).status).toBe(200);
      const on = await w.operator.send('patch', cardPath(c.number), {
        autoRunWhenReady: true,
      });
      expect(on.status).toBe(200);

      // Unticked items do not hold Done back (D6).
      const done = await w.viewer.send(
        'post',
        `${cardPath(t.number)}/done`,
        {},
      );
      expect(done.status).toBe(200);
      await w.work.settled();
      expect(w.sent('card.run')).toHaveLength(1);
      expect(w.sent('card.run')[0]).toMatchObject({ cardId: c.id });
      expect((await w.card(c.number)).column).toBe('in_progress');
    });

    it('Reopen puts a done task back at the top of To Do and waits its dependant again', async () => {
      const t = await task();
      const c = await w.createCard({ title: 'Charge cards', specOnRun: false });
      await link(c.number, t.number);
      await w.viewer.send('post', `${cardPath(t.number)}/done`, { note: 'x' });

      const again = await w.viewer.send(
        'post',
        `${cardPath(t.number)}/done`,
        {},
      );
      expect(again.status).toBe(409);
      expect(again.body.error).toBe(BOARD_ERROR.wrongColumn);

      const reopened = await w.viewer.send(
        'post',
        `${cardPath(t.number)}/reopen`,
      );
      expect(reopened.status).toBe(200);
      expect(reopened.body).toMatchObject({ column: 'todo', taskNote: null });
      expect((await face(c.number))?.readiness).toMatchObject({
        state: 'waiting',
      });
      expect(await w.audit('card.task_reopened')).toHaveLength(1);
    });

    it('refuses Done on a code card with 409 not_a_task', async () => {
      const code = await w.createCard({ title: 'Add login' });
      const response = await w.operator.send(
        'post',
        `${cardPath(code.number)}/done`,
        {},
      );
      expect(response.status).toBe(409);
      expect(response.body.error).toBe(BOARD_ERROR.notATask);
    });
  });

  describe('who may act', () => {
    const otherViewer = async () => {
      const user = await createUser(w.ctx.prisma, 'viewer-2@x.test', 'viewer');
      await w.ctx.prisma.projectMember.create({
        data: { projectId: w.a, userId: user.id },
      });
      return login(w.ctx, 'viewer-2@x.test');
    };

    it('lets the assignee viewer tick, but not edit, the checklist', async () => {
      const t = await task();
      const [first] = (await detail(t.number)).checklistItems ?? [];
      const item = `${cardPath(t.number)}/checklist/${first.id}`;

      const ticked = await w.viewer.send('patch', item, { done: true });
      expect(ticked.status).toBe(200);
      expect(ticked.body.checklist).toEqual({ done: 1, total: 2 });
      expect(ticked.body.checklistItems[0]).toMatchObject({
        doneBy: { id: await userId('viewer@x.test') },
      });

      const edited = await w.viewer.send('patch', item, { text: 'Rotate it' });
      expect(edited.status).toBe(403);
      const added = await w.viewer.send(
        'post',
        `${cardPath(t.number)}/checklist`,
        { text: 'More' },
      );
      expect(added.status).toBe(403);
    });

    it('lets an operator edit the checklist: add, reword, reorder and remove', async () => {
      const t = await task();
      const path = `${cardPath(t.number)}/checklist`;
      const added = await w.operator.send('post', path, { text: 'Tell ops' });
      expect(added.status).toBe(201);
      const items = (added.body as BoardCardDetail).checklistItems ?? [];
      expect(items.map((i) => i.text)).toEqual([
        'Create the key',
        'Store it in the vault',
        'Tell ops',
      ]);
      const moved = await w.operator.send('patch', `${path}/${items[2].id}`, {
        text: 'Tell the ops team',
        position: 0.5,
      });
      expect(
        (moved.body as BoardCardDetail).checklistItems?.map((i) => i.text),
      ).toEqual([
        'Tell the ops team',
        'Create the key',
        'Store it in the vault',
      ]);
      const removed = await w.operator.send('delete', `${path}/${items[0].id}`);
      expect(removed.status).toBe(200);
      expect((removed.body as BoardCardDetail).checklist).toEqual({
        done: 0,
        total: 2,
      });
    });

    it('refuses Done, Reopen and a tick from another viewer with 403; a non-member gets 404', async () => {
      const t = await task();
      const other = await otherViewer();
      const [first] = (await detail(t.number)).checklistItems ?? [];
      const path = cardPath(t.number);

      expect((await other.send('post', `${path}/done`, {})).status).toBe(403);
      expect(
        (
          await other.send('patch', `${path}/checklist/${first.id}`, {
            done: true,
          })
        ).status,
      ).toBe(403);
      expect((await w.outsider.send('post', `${path}/done`, {})).status).toBe(
        404,
      );

      expect((await w.viewer.send('post', `${path}/done`, {})).status).toBe(
        200,
      );
      expect((await other.send('post', `${path}/reopen`)).status).toBe(403);
      // An operator may act on any task.
      expect((await w.operator.send('post', `${path}/reopen`)).status).toBe(
        200,
      );
    });
  });

  describe('assignment', () => {
    it('assigns an unassigned Inbox task to the person who accepts it', async () => {
      const t = await task();
      await w.ctx.prisma.boardCard.update({
        where: { id: t.id },
        data: { column: 'inbox', assigneeId: null, source: 'captured' },
      });
      const accepted = await w.operator.send(
        'post',
        `${cardPath(t.number)}/accept-suggestion`,
        {},
      );
      expect(accepted.status).toBe(200);
      expect(accepted.body).toMatchObject({
        column: 'todo',
        assignee: { id: w.operatorId },
      });
    });

    it("unassigns a member's open tasks when they leave the project", async () => {
      const open = await task();
      const closed = await task();
      await w.viewer.send('post', `${cardPath(closed.number)}/done`, {});
      const viewer = await userId('viewer@x.test');

      const removed = await w.admin.send(
        'delete',
        `${w.path()}/members/${viewer}`,
      );
      expect(removed.status).toBe(204);
      expect((await w.card(open.number)).assigneeId).toBeNull();
      expect((await w.card(closed.number)).assigneeId).toBe(viewer);
    });
  });
});
