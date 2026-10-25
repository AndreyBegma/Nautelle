import { CARD_FINISHED_PR_POLL_MS } from '@nautelle/shared';
import { BoardShipping } from './board-shipping';
import { BoardWorld, cardChecks, ok } from './testing/board-e2e';

const BASE = 'develop';
const MERGED = '2026-10-24T10:00:00.000Z';

/**
 * C-389 (ADR-0098): a card whose PR merged into the project base moves to
 * Completed by itself — merged on GitHub, by auto-merge or through Accept —
 * and the cards Finished held merged before this change are swept there.
 * Auto-merge and Accept are covered in board-ships and board-accept.
 */
describe('a merged card completes itself (e2e, C-389)', () => {
  const w = new BoardWorld();
  let shipping: BoardShipping;

  beforeAll(async () => {
    await w.init();
    shipping = w.ctx.app.get(BoardShipping);
  });
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    w.checksServed = true;
  });
  afterEach(() => w.work.settled());

  /** `card.checks` answers by PR number; any other PR is open and green. */
  const prs = (byPr: Record<number, Record<string, unknown>>) => {
    w.handlers['card.checks'] = (args) =>
      ok(cardChecks(byPr[Number(args.pr)] ?? {}));
  };

  /** A card in `column` with PR `pr`; by default open, in Finished. */
  const withPr = async (pr: number, extra: object = {}) => {
    const card = await w.createCard({ specOnRun: false });
    await w.ctx.prisma.boardCard.update({
      where: { id: card.id },
      data: {
        column: 'finished',
        branch: `card/c${card.number}-work`,
        prNumber: pr,
        prUrl: `https://github.com/acme/widget/pull/${pr}`,
        prState: 'open',
        ...extra,
      },
    });
    return card;
  };

  const reads = (pr: number) =>
    jest
      .mocked(w.commands.checks)
      .mock.calls.filter(([, args]) => args.pr === pr);

  describe('a merge on GitHub', () => {
    it('completes a Finished card the CI pass does not read, audits it and cleans up', async () => {
      // Auto-merge off: nothing else reads this card's PR.
      await w.ctx.prisma.project.update({
        where: { id: w.a },
        data: { baseBranch: 'main' },
      });
      const card = await withPr(77, { ciState: 'green' });
      prs({ 77: { state: 'merged', base: 'main', mergedAt: MERGED } });

      await shipping.poll();
      await w.work.settled();

      expect(await w.card(card.number)).toMatchObject({
        column: 'completed',
        prState: 'merged',
        mergedAt: new Date(MERGED),
      });
      expect((await w.card(card.number)).completedAt).not.toBeNull();
      const [record] = await w.audit('card.completed_by_merge');
      expect(record).toMatchObject({ actorType: 'system', result: 'ok' });
      expect(record.after).toEqual({ number: card.number, pr: 77 });
      expect(await w.audit('card.accepted')).toHaveLength(0);
      expect(w.sent('card.close')).toEqual([
        expect.objectContaining({ cardId: card.id, removeWorktree: true }),
      ]);
      expect(w.sent('card.merge')).toEqual([]);
    });

    it('reads such a PR at most every CARD_FINISHED_PR_POLL_MS', async () => {
      const card = await withPr(77, { needsPerson: true });
      prs({});

      await shipping.poll();
      await shipping.poll();
      expect(reads(77)).toHaveLength(1);
      expect((await w.card(card.number)).column).toBe('finished');

      const now = Date.now();
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(now + CARD_FINISHED_PR_POLL_MS + 1);
      try {
        prs({ 77: { state: 'merged', base: BASE, mergedAt: MERGED } });
        await shipping.poll();
      } finally {
        clock.mockRestore();
      }
      await w.work.settled();
      expect(reads(77)).toHaveLength(2);
      expect((await w.card(card.number)).column).toBe('completed');
      // Its checks are not stored: a merge watch never feeds the CI pass.
      expect((await w.card(card.number)).ciCheckedAt).toBeNull();
    });

    it('records a PR closed on GitHub; the card stays in Finished for Accept', async () => {
      const card = await withPr(77, { protectedPaths: ['infra/'] });
      prs({ 77: { state: 'closed' } });

      await shipping.poll();

      expect(await w.card(card.number)).toMatchObject({
        column: 'finished',
        prState: 'closed',
        mergedAt: null,
      });
      expect(w.sent('card.close')).toEqual([]);
    });

    it('a stacked PR merged into its dependency branch has not landed: the card stays', async () => {
      const dependency = await withPr(70);
      const card = await withPr(78, {
        prState: 'merged',
        mergedAt: new Date(MERGED),
        prBase: 'card/c1-work',
        prBaseCardId: dependency.id,
      });
      prs({});

      await shipping.poll();
      await w.work.settled();

      expect((await w.card(card.number)).column).toBe('finished');
      expect(await w.audit('card.completed_by_merge')).toHaveLength(0);
    });
  });

  describe('the sweep (the one-time migration)', () => {
    it('completes every merged Finished card, but not a terminal one', async () => {
      w.checksServed = false;
      const first = await withPr(77, {
        prState: 'merged',
        mergedAt: new Date(MERGED),
      });
      const second = await withPr(78, {
        prState: 'merged',
        mergedAt: new Date(MERGED),
      });
      const terminal = await withPr(79, {
        source: 'terminal',
        prState: 'merged',
        mergedAt: new Date(MERGED),
      });
      const open = await withPr(80);

      await shipping.poll();
      await w.work.settled();

      expect((await w.card(first.number)).column).toBe('completed');
      expect((await w.card(second.number)).column).toBe('completed');
      expect((await w.card(terminal.number)).column).toBe('finished');
      expect((await w.card(open.number)).column).toBe('finished');
      const records = await w.audit('card.completed_by_merge');
      expect(records.map((r) => r.after)).toEqual(
        expect.arrayContaining([
          { number: first.number, pr: 77 },
          { number: second.number, pr: 78 },
        ]),
      );
      expect(records).toHaveLength(2);
      expect(w.sent('card.close')).toHaveLength(2);
    });

    it('waits for a round still running on a merged card, then completes it', async () => {
      const card = await w.createCard({ specOnRun: false });
      expect((await w.runCard(card.number)).status).toBe(200);
      await w.ctx.prisma.boardCard.update({
        where: { id: card.id },
        data: {
          prNumber: 77,
          prState: 'merged',
          mergedAt: new Date(MERGED),
        },
      });
      w.checksServed = false;

      await shipping.completeMergedCards();
      expect((await w.card(card.number)).column).toBe('in_progress');

      const { rounds } = await w.card(card.number);
      await w.ctx.prisma.boardCardRound.update({
        where: { id: rounds[rounds.length - 1].id },
        data: { phase: 'ended' },
      });
      await shipping.completeMergedCards();
      await w.work.settled();
      expect((await w.card(card.number)).column).toBe('completed');
    });
  });
});
