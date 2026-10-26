import { describe, expect, test } from 'bun:test';
import {
  type BoardCardView,
  type BoardView,
  type CardFleetView,
  type FleetWorkingView,
  isWorkingCard,
} from '@nautelle/shared';
import { boardView, card, round } from '../board/fixtures';
import { workingNow } from './working-now';

/** What `GET /fleet/working` answers for these cards: the ones at work. */
const workingView = (cards: BoardCardView[]): FleetWorkingView => ({
  projectId: 'p1',
  cards: cards.filter(isWorkingCard),
});

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
      workingNow(workingView([card(1, 'todo'), card(2, 'finished')])),
    ).toEqual([]);
  });

  test('lists a card worker with its phase and a link to the card', () => {
    const rows = workingNow(
      workingView([card(4, 'in_progress', { round: round('waiting') })]),
    );
    expect(rows).toEqual([
      {
        key: 'worker:card-4',
        kind: 'worker',
        number: 4,
        place: null,
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
        workingView([card(4, 'finished', { round: round('finished') })]),
      ),
    ).toEqual([]);
  });

  test('lists a live slot, also on a card a person moved, and not a gone one', () => {
    const rows = workingNow(
      workingView([
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
      workingView([
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
      workingView([
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
      workingView([
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

  test('lists the run queue last, in the order its cards start (C-398)', () => {
    const rows = workingNow(
      workingView([
        card(1, 'in_progress', { round: round('running') }),
        card(2, 'todo', {
          queue: { state: 'waiting', place: null, stack: 3 },
        }),
        card(3, 'todo', { queue: { state: 'queued', place: 2, stack: null } }),
        card(4, 'todo', { queue: { state: 'queued', place: 1, stack: null } }),
      ]),
    );
    expect(rows.map((r) => [r.kind, r.label, r.state, r.status])).toEqual([
      ['worker', 'C-1', 'Running', 'running'],
      ['queued', 'C-4', 'Waiting for a slot · #1', 'idle'],
      ['queued', 'C-3', 'Waiting for a slot · #2', 'idle'],
      ['queued', 'C-2', 'Queued · waiting for a dependency', 'blocked'],
    ]);
  });

  test('rows from the working view equal the rows built from the full Board (C-473)', () => {
    const cards = [
      card(1, 'inbox', {
        source: 'captured',
        tracking: { sessionId: 's0', alive: true },
      }),
      card(2, 'todo'),
      card(3, 'todo', { queue: { state: 'queued', place: 1, stack: null } }),
      card(4, 'todo', { queue: { state: 'waiting', place: null, stack: 2 } }),
      card(5, 'in_progress', { round: round('running') }),
      card(6, 'in_progress', { round: round('failed') }),
      card(7, 'in_progress', { source: 'fleet', fleet: fleet() }),
      card(8, 'in_progress', {
        source: 'fleet',
        fleet: fleet({ slot: 'fd-2', slotGone: true }),
      }),
      card(9, 'completed', { source: 'fleet', fleet: fleet({ slot: 'fd-3' }) }),
      card(10, 'in_progress', {
        source: 'terminal',
        tracking: { sessionId: 's1', alive: true },
        round: round('running'),
      }),
      card(11, 'finished', {
        taken: { sessionId: 's2', alive: true, branch: 'card/c11' },
        round: round('waiting'),
      }),
      card(12, 'in_progress', {
        taken: { sessionId: 's3', alive: false, branch: null },
      }),
      card(13, 'finished', { round: round('finished') }),
      card(14, 'in_progress', {
        source: 'fleet',
        fleet: fleet({ slot: 'fd-4' }),
        round: round('running'),
      }),
    ];
    expect(workingNow(workingView(cards))).toEqual(fromBoard(boardView(cards)));
    expect(workingNow(workingView(cards)).map((r) => r.key)).toEqual([
      'worker:card-5',
      'worker:card-11',
      'slot:card-7',
      'slot:card-14',
      'session:card-10',
      'session:card-11',
      'queued:card-3',
      'queued:card-4',
    ]);
  });
});

/**
 * Before C-473 the Fleet page read Working now off the whole Board: every
 * card out of the Inbox, through the same rows.
 */
const fromBoard = (board: BoardView) =>
  workingNow({
    projectId: board.projectId,
    cards: board.columns
      .filter((column) => column.column !== 'inbox')
      .flatMap((column) => column.cards),
  });
