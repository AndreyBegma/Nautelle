import { BoardFixWaits, CARD_FIX_WAIT_MAX_MS } from './board-fix-waits';

describe('BoardFixWaits (C-418)', () => {
  it('takes the waits of one project, oldest first, and empties them', () => {
    const waits = new BoardFixWaits();
    const now = Date.now();
    waits.add('p', 'late', now - 1_000);
    waits.add('p', 'early', now - 5_000);
    waits.add('q', 'other', now);

    expect(waits.take('p')).toEqual([
      { cardId: 'early', since: now - 5_000 },
      { cardId: 'late', since: now - 1_000 },
    ]);
    expect(waits.has('p')).toBe(false);
    expect(waits.has('q')).toBe(true);
  });

  it('keeps the older since when a card waits again', () => {
    const waits = new BoardFixWaits();
    const now = Date.now();
    waits.add('p', 'c', now - 100);
    waits.add('p', 'c', now);
    waits.add('p', 'c', now - 500);
    expect(waits.take('p')).toEqual([{ cardId: 'c', since: now - 500 }]);
  });

  it('drops a card whose round started', () => {
    const waits = new BoardFixWaits();
    waits.add('p', 'c');
    waits.drop('p', 'c');
    expect(waits.has('p')).toBe(false);
  });

  it(`forgets a wait older than ${CARD_FIX_WAIT_MAX_MS / 60_000} min`, () => {
    const waits = new BoardFixWaits();
    waits.add('p', 'old', Date.now() - CARD_FIX_WAIT_MAX_MS - 1);
    expect(waits.has('p')).toBe(false);
    expect(waits.take('p')).toEqual([]);
  });
});
