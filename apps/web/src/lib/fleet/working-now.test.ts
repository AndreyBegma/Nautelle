import { describe, expect, test } from 'bun:test';
import type { CardFleetView } from '@nautelle/shared';
import { boardView, card, round } from '../board/fixtures';
import { workingNow } from './working-now';

const fleet = (extra: Partial<CardFleetView> = {}): CardFleetView => ({
  issue: 12,
  slot: 'fd-1',
  stage: 'plan_ready',
  slotGone: false,
  detached: false,
  ...extra,
});

describe('workingNow (C-397)', () => {
  test('is empty when nothing runs', () => {
    expect(
      workingNow(boardView([card(1, 'todo'), card(2, 'finished')])),
    ).toEqual([]);
  });

  test('lists a card worker with its phase and a link to the card', () => {
    const rows = workingNow(
      boardView([card(4, 'in_progress', { round: round('waiting') })]),
    );
    expect(rows).toEqual([
      {
        key: 'worker:card-4',
        kind: 'worker',
        number: 4,
        label: 'C-4',
        title: 'Card 4',
        state: 'Waiting for you',
        status: 'waiting',
        href: '/projects/p1/board?card=4',
      },
    ]);
  });

  test('skips a worker whose round is over', () => {
    expect(
      workingNow(
        boardView([card(4, 'finished', { round: round('finished') })]),
      ),
    ).toEqual([]);
  });

  test('lists a live slot, also on a card a person moved, and not a gone one', () => {
    const rows = workingNow(
      boardView([
        card(7, 'in_progress', { source: 'fleet', fleet: fleet() }),
        card(8, 'todo', {
          source: 'fleet',
          fleet: fleet({ slot: 'fd-2', detached: true }),
        }),
        card(9, 'in_progress', {
          source: 'fleet',
          fleet: fleet({ slot: 'fd-3', slotGone: true }),
        }),
        card(10, 'todo', { source: 'fleet', fleet: fleet({ slot: null }) }),
      ]),
    );
    expect(rows.map((r) => [r.kind, r.label, r.state])).toEqual([
      ['slot', 'C-7', 'fd-1 · Plan ready'],
      ['slot', 'C-8', 'fd-2 · Plan ready'],
    ]);
  });

  test('a fleet card with a round is the slot, not a card worker', () => {
    const rows = workingNow(
      boardView([
        card(7, 'in_progress', {
          source: 'fleet',
          fleet: fleet(),
          round: round('running'),
        }),
      ]),
    );
    expect(rows.map((r) => r.kind)).toEqual(['slot']);
  });

  test('lists a tracked terminal session and a session that took the card', () => {
    const rows = workingNow(
      boardView([
        card(3, 'in_progress', {
          source: 'terminal',
          tracking: { sessionId: 's1', alive: true },
        }),
        card(5, 'in_progress', {
          taken: { sessionId: 's2', alive: true, branch: 'card/c5' },
        }),
        card(6, 'in_progress', {
          taken: { sessionId: 's3', alive: false, branch: null },
        }),
      ]),
    );
    expect(rows.map((r) => [r.kind, r.label, r.state])).toEqual([
      ['session', 'C-3', 'Terminal session running'],
      ['session', 'C-5', 'Taken by a session on card/c5'],
    ]);
  });

  test('orders workers, then slots, then sessions', () => {
    const rows = workingNow(
      boardView([
        card(1, 'in_progress', {
          source: 'terminal',
          tracking: { sessionId: 's1', alive: true },
        }),
        card(2, 'in_progress', { source: 'fleet', fleet: fleet() }),
        card(3, 'in_progress', { round: round('running') }),
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual(['C-3', 'C-2', 'C-1']);
  });
});
