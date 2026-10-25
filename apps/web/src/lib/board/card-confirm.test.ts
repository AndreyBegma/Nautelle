import { describe, expect, test } from 'bun:test';
import type { BoardCardView } from '@nautelle/shared';
import { closedGate, probeGate } from '../../components/confirm/gate-probe';
import {
  type CardConfirmation,
  cardConfirmCopy,
  stopLeavesQueue,
} from './card-confirm';

const card = { number: 7, label: 'C-7' } as BoardCardView;

describe('Dismiss one Inbox card (C-166)', () => {
  test('asks, naming the card that is deleted', () => {
    const gate = probeGate<CardConfirmation>(cardConfirmCopy, {
      kind: 'dismiss',
      card,
    });
    expect(gate.dialog.title).toBe('Dismiss C-7?');
    expect(gate.dialog.verb).toBe('Dismiss');
    expect(gate.dialog.tone).toBe('danger');
  });

  test('the dismissal runs only after Dismiss, never on Cancel', () => {
    const pending: CardConfirmation = { kind: 'dismiss', card };
    const cancelled = probeGate(cardConfirmCopy, pending);
    cancelled.cancel();
    expect(cancelled.confirmed).toEqual([]);
    expect(cancelled.cancelled()).toBe(1);

    const confirmed = probeGate(cardConfirmCopy, pending);
    confirmed.confirm();
    expect(confirmed.confirmed).toEqual([pending]);
  });

  test('nothing pending, nothing drawn', () => {
    expect(closedGate(cardConfirmCopy).element).toBeNull();
  });
});

describe('the other card confirmations keep their words', () => {
  test('dismiss all, stop and delete', () => {
    expect(cardConfirmCopy({ kind: 'dismiss-all', count: 3 }).title).toBe(
      'Dismiss all 3 suggestions?',
    );
    expect(cardConfirmCopy({ kind: 'stop', card }).verb).toBe('Stop worker');
    expect(cardConfirmCopy({ kind: 'delete', card }).title).toBe('Delete C-7?');
  });
});

describe('Stop on a card waiting in the run queue (C-398)', () => {
  const queued = {
    ...card,
    round: null,
    queue: { state: 'queued', place: 1, stack: null },
  } as BoardCardView;

  test('takes it out of the queue instead of stopping a worker', () => {
    expect(stopLeavesQueue(queued)).toBe(true);
    const copy = cardConfirmCopy({ kind: 'stop', card: queued });
    expect(copy.title).toBe('Take C-7 out of the run queue?');
    expect(copy.verb).toBe('Remove from queue');
  });

  test('a card with a running worker keeps Stop worker', () => {
    const running = { ...card, round: { phase: 'running' } } as BoardCardView;
    expect(stopLeavesQueue(running)).toBe(false);
  });
});
