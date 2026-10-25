import { describe, expect, test } from 'bun:test';
import type { BoardCardView } from '@nautelle/shared';
import { faceState } from './face-state';
import { card, round } from './fixtures';

const state = (extra: Partial<BoardCardView> = {}) =>
  faceState(card(7, 'in_progress', extra));

describe('faceState (C-392)', () => {
  test('a card with nothing going on has no state', () => {
    expect(faceState(card(7, 'todo'))).toBeNull();
  });

  test('a running round is running', () => {
    expect(state({ round: round('running') })).toMatchObject({
      status: 'running',
    });
  });

  test('a finished round shows nothing: the column says it', () => {
    expect(state({ round: round('finished') })).toBeNull();
  });

  test('a failed round is Failed', () => {
    expect(state({ round: round('failed') })).toMatchObject({
      status: 'error',
      label: 'Failed',
    });
  });

  test('a refused auto-run is Failed', () => {
    expect(
      state({
        autoRunFailure: {
          code: 'unknown',
          message: 'boom',
          at: '2026-10-16T10:00:00.000Z',
        },
      }),
    ).toMatchObject({ status: 'error', label: 'Failed' });
  });

  test('a round waiting for the person is a Question', () => {
    expect(state({ round: round('waiting') })).toMatchObject({
      status: 'waiting',
      label: 'Question',
    });
  });

  test('a stopped automation needs the person and says why in the title', () => {
    expect(
      state({
        needsPerson: true,
        needsPersonReason: 'ci_still_failing',
        ciState: 'red',
      }),
    ).toMatchObject({
      status: 'blocked',
      label: 'Needs you',
      title: expect.stringContaining('CI still failing'),
    });
  });

  test('a usage-limit wait with a reset time is its own idle state', () => {
    expect(
      state({
        round: round('running', {
          quotaWait: {
            limit: 'session',
            resetsAt: '2026-10-21T15:00:00.000Z',
          },
        }),
      }),
    ).toMatchObject({
      status: 'idle',
      label: 'Usage limit',
      title: expect.stringContaining('Waiting for the limit until'),
    });
  });

  test('a usage-limit wait without a reset time needs you', () => {
    expect(
      state({
        round: round('running', {
          quotaWait: { limit: 'weekly', resetsAt: null },
        }),
      }),
    ).toMatchObject({
      status: 'blocked',
      label: 'Needs you',
      title: expect.stringContaining('Limit reached'),
    });
  });

  test('a round a hard budget paused reads Paused: budget (C-399)', () => {
    expect(
      state({ round: round('cancelled', { pausedFor: 'budget' }) }),
    ).toMatchObject({ status: 'blocked', label: 'Paused: budget' });
  });

  test('failed beats needs you beats a question beats running', () => {
    const running = round('running');
    expect(
      state({ round: running, needsPerson: true, autoRunFailure: null })?.label,
    ).toBe('Needs you');
    expect(state({ round: round('waiting'), needsPerson: true })?.label).toBe(
      'Needs you',
    );
    expect(state({ round: round('failed'), needsPerson: true })?.label).toBe(
      'Failed',
    );
  });
});
