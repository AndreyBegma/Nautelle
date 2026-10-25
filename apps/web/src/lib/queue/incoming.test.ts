import { describe, expect, test } from 'bun:test';
import {
  BOARD_CARD_TITLE_MAX,
  type QueueItemView,
  type QueueView,
} from '@nautelle/shared';
import { incomingIssues, makeCardRequest } from './incoming';

const item = (
  number: number,
  extra: Partial<QueueItemView> = {},
): QueueItemView => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/o/r/issues/${number}`,
  labels: ['cs:ready'],
  assignees: [],
  state: 'ready',
  why: '',
  clears: null,
  source: 'computed',
  computed: null,
  priority: null,
  blockers: [],
  waveSlots: null,
  ghUpdatedAt: '2026-10-08T00:00:00Z',
  ...extra,
});

const view = (
  items: QueueItemView[],
  others: QueueView['others'],
): QueueView => ({
  snapshotAt: null,
  unavailable: null,
  readyLabel: 'cs:ready',
  round: null,
  items,
  heldForLead: [],
  others,
});

describe('incomingIssues (C-397)', () => {
  const data = view(
    [item(3), item(9, { cardNumber: 41 })],
    [
      {
        number: 12,
        title: 'Other 12',
        url: 'https://github.com/o/r/issues/12',
        labels: ['bug'],
      },
      {
        number: 5,
        title: 'Other 5',
        url: 'https://github.com/o/r/issues/5',
        labels: [],
        cardNumber: 7,
      },
    ],
  );

  test('Labelled lists the ready issues only, newest first, with their card', () => {
    expect(
      incomingIssues(data, 'labelled').map((i) => [
        i.number,
        i.ready,
        i.cardNumber,
      ]),
    ).toEqual([
      [9, true, 41],
      [3, true, null],
    ]);
  });

  test('All adds every other open issue after the labelled ones', () => {
    expect(
      incomingIssues(data, 'all').map((i) => [i.number, i.ready, i.cardNumber]),
    ).toEqual([
      [9, true, 41],
      [3, true, null],
      [12, false, null],
      [5, false, 7],
    ]);
  });

  test('All without the open issues loaded is the labelled list', () => {
    expect(incomingIssues(view([item(1)], undefined), 'all')).toHaveLength(1);
  });
});

describe('makeCardRequest', () => {
  test('links the issue and takes its title', () => {
    expect(makeCardRequest({ number: 4, title: '  Fix login  ' })).toEqual({
      title: 'Fix login',
      issueNumber: 4,
    });
  });

  test('cuts a long title to the card limit and names an untitled issue', () => {
    expect(
      makeCardRequest({ number: 4, title: 'x'.repeat(500) }).title,
    ).toHaveLength(BOARD_CARD_TITLE_MAX);
    expect(makeCardRequest({ number: 4, title: ' ' }).title).toBe('#4');
  });
});
