import { BoardHeadCarry } from './board-head-carry';
import { BoardWorld, failed, ok, ROOT_A } from './testing/board-e2e';

const FROM = 'b'.repeat(40);
const TO = 'c'.repeat(40);

/**
 * C-457: `BoardHeadCarry.isBaseMerge` asks the runner's `card.headDelta`
 * once per pair of a card's heads and keeps the answer in
 * `card_head_carries`; a runner that cannot tell gives `false` and nothing
 * is stored.
 */
describe('head carries (e2e, C-457)', () => {
  const w = new BoardWorld();
  let carry: BoardHeadCarry;

  beforeAll(async () => {
    await w.init();
    carry = w.ctx.app.get(BoardHeadCarry);
  });
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const setup = async (prBase: string | null = null) => {
    const { id, number } = await w.createCard();
    const project = await w.work.project(w.a);
    const card = { id, number, prBase };
    return {
      project,
      card,
      ask: () => carry.isBaseMerge(project, card, FROM, TO),
    };
  };
  const stored = () => w.ctx.prisma.cardHeadCarry.findMany();

  it('asks the runner once for a pair and answers later calls from the table', async () => {
    w.handlers['card.headDelta'] = () => ok({ baseMerge: true });
    const { card, ask } = await setup();

    expect(await ask()).toBe(true);
    expect(await ask()).toBe(true);

    expect(w.headDeltas()).toEqual([
      {
        cardId: card.id,
        projectId: w.a,
        root: ROOT_A,
        from: FROM,
        to: TO,
        base: 'develop',
      },
    ]);
    expect(await stored()).toEqual([
      expect.objectContaining({
        cardId: card.id,
        fromSha: FROM,
        toSha: TO,
        baseMerge: true,
        reason: null,
      }),
    ]);
  });

  it('keeps a "no" with its reason, and asks about the PR base', async () => {
    w.handlers['card.headDelta'] = () =>
      ok({ baseMerge: false, reason: 'tree_differs' });
    const { ask } = await setup('card/c1-login');

    expect(await ask()).toBe(false);
    expect(await ask()).toBe(false);

    expect(w.headDeltas()).toHaveLength(1);
    expect(w.headDeltas()[0]?.base).toBe('card/c1-login');
    expect(await stored()).toEqual([
      expect.objectContaining({ baseMerge: false, reason: 'tree_differs' }),
    ]);
  });

  it('gives false and stores nothing on a runner without card.headDelta', async () => {
    w.headDeltaServed = false;
    const { ask } = await setup();

    expect(await ask()).toBe(false);

    expect(w.headDeltas()).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it('gives false and stores nothing when the runner gives no answer, then asks again', async () => {
    w.handlers['card.headDelta'] = () => failed('internal', 'git exploded');
    const { ask } = await setup();

    expect(await ask()).toBe(false);
    w.handlers['card.headDelta'] = () => ({ status: 'unknown' });
    expect(await ask()).toBe(false);
    expect(await stored()).toEqual([]);

    w.handlers['card.headDelta'] = () => ok({ baseMerge: true });
    expect(await ask()).toBe(true);
    expect(w.headDeltas()).toHaveLength(3);
  });

  it('never asks about a head and itself', async () => {
    const { project, card } = await setup();

    expect(await carry.isBaseMerge(project, card, FROM, FROM)).toBe(false);
    expect(w.headDeltas()).toEqual([]);
  });
});
