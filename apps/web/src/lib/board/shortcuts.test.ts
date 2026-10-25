import { describe, expect, test } from 'bun:test';
import { linkIntentStep, moveCursor, SHORTCUT_GROUPS } from './shortcuts';

describe('moveCursor (C-393)', () => {
  const order = [3, 7, 9];

  test('moves one card and holds at the ends', () => {
    expect(moveCursor(order, 3, 1)).toBe(7);
    expect(moveCursor(order, 9, 1)).toBe(9);
    expect(moveCursor(order, 3, -1)).toBe(3);
    expect(moveCursor(order, 9, -1)).toBe(7);
  });

  test('with no cursor the first key lands on an end', () => {
    expect(moveCursor(order, undefined, 1)).toBe(3);
    expect(moveCursor(order, undefined, -1)).toBe(9);
  });

  test('a card that left the Board counts as no cursor', () => {
    expect(moveCursor(order, 42, 1)).toBe(3);
  });

  test('an empty Board has nowhere to go', () => {
    expect(moveCursor([], undefined, 1)).toBeUndefined();
  });
});

describe('SHORTCUT_GROUPS', () => {
  test('lists every Board key and the palette', () => {
    const keys = SHORTCUT_GROUPS.flatMap((g) =>
      g.shortcuts.flatMap((s) => s.keys),
    );
    for (const key of ['j', 'k', 'Enter', 'r', 'a', 'n', '?', 'K']) {
      expect(keys).toContain(key);
    }
  });
});

describe('linkIntentStep (C-393)', () => {
  const base = {
    intent: 'stop' as const,
    cardNumber: 12,
    projectLoaded: true,
    handled: undefined,
  };

  test('waits while the project detail has not arrived', () => {
    expect(linkIntentStep({ ...base, projectLoaded: false })).toEqual({
      kind: 'wait',
    });
  });

  test('handles the link once the card and the project are there', () => {
    expect(linkIntentStep(base)).toEqual({ kind: 'handle', key: 'stop:12' });
  });

  test('does not handle the same link twice', () => {
    expect(linkIntentStep({ ...base, handled: 'stop:12' })).toEqual({
      kind: 'wait',
    });
  });

  test('waits without a card or an intent', () => {
    expect(linkIntentStep({ ...base, cardNumber: undefined }).kind).toBe(
      'wait',
    );
    expect(linkIntentStep({ ...base, intent: undefined }).kind).toBe('wait');
  });
});
