import { describe, expect, test } from 'bun:test';
import type { CardDependencyRef } from '@nautelle/shared';
import {
  autoRunNote,
  dependencyChip,
  isOpenDependency,
  parseCardNumber,
  readinessChip,
  runWaitsFor,
} from './dependencies';

const ref = (
  number: number,
  column: CardDependencyRef['column'],
  landed = column === 'completed',
): CardDependencyRef => ({ number, label: `C-${number}`, column, landed });

describe('card dependencies (#337 D8)', () => {
  test('the face says "after C-12", and warns while it is open', () => {
    expect(dependencyChip(undefined)).toBeNull();
    expect(dependencyChip([])).toBeNull();
    const chip = dependencyChip([ref(12, 'todo')]);
    expect(chip?.text).toBe('after C-12');
    expect(chip?.open).toBe(true);
    expect(chip?.title).toBe(
      'Runs after C-12. No ready pull request yet: C-12.',
    );
    expect(dependencyChip([ref(12, 'completed')])?.open).toBe(false);
  });

  test('a Finished dependency reads as satisfied (#638)', () => {
    const chip = dependencyChip([ref(12, 'finished'), ref(13, 'completed')]);
    expect(chip?.open).toBe(false);
    expect(chip?.title).toBe('Runs after C-12, C-13, all ready.');
  });

  test('more than two dependencies are counted', () => {
    const chip = dependencyChip([
      ref(3, 'completed'),
      ref(5, 'completed'),
      ref(9, 'in_progress'),
    ]);
    expect(chip?.text).toBe('after C-3, C-5 +1');
    expect(chip?.title).toBe(
      'Runs after C-3, C-5, C-9. No ready pull request yet: C-9.',
    );
  });

  test('a dependency is open until Finished or Completed (#638)', () => {
    expect(isOpenDependency('inbox')).toBe(true);
    expect(isOpenDependency('todo')).toBe(true);
    expect(isOpenDependency('in_progress')).toBe(true);
    expect(isOpenDependency('finished')).toBe(false);
    expect(isOpenDependency('completed')).toBe(false);
  });

  test('Run is held with the open ones named (#638)', () => {
    expect(runWaitsFor(undefined)).toBeNull();
    expect(runWaitsFor([])).toBeNull();
    expect(runWaitsFor([ref(12, 'finished'), ref(13, 'completed')])).toBeNull();
    expect(runWaitsFor([ref(12, 'todo')])).toBe('Waits for C-12');
    expect(
      runWaitsFor([
        ref(13, 'todo'),
        ref(14, 'in_progress'),
        ref(15, 'finished'),
        ref(16, 'todo'),
      ]),
    ).toBe('Waits for C-13, C-14 and C-16');
  });

  test('Run is held while two satisfied dependencies are not merged (C-417)', () => {
    expect(runWaitsFor([ref(1, 'finished'), ref(2, 'finished')])).toBe(
      'C-1 and C-2 are not merged yet; a card branches from one dependency only',
    );
    expect(runWaitsFor([ref(1, 'finished'), ref(2, 'completed')])).toBeNull();
    expect(
      runWaitsFor([ref(1, 'finished'), ref(2, 'finished', true)]),
    ).toBeNull();
    expect(runWaitsFor([ref(1, 'finished'), ref(3, 'todo')])).toBe(
      'Waits for C-3',
    );
  });

  test('the add field takes 12 or C-12', () => {
    expect(parseCardNumber('12')).toBe(12);
    expect(parseCardNumber(' C-12 ')).toBe(12);
    expect(parseCardNumber('c12')).toBe(12);
    expect(parseCardNumber('0')).toBeNull();
    expect(parseCardNumber('twelve')).toBeNull();
    expect(parseCardNumber('')).toBeNull();
  });
});

describe('readiness (#443)', () => {
  test('Ready when every dependency is in Finished or Completed', () => {
    expect(readinessChip(null)).toBeNull();
    expect(readinessChip(undefined)).toBeNull();
    expect(
      readinessChip({
        state: 'ready',
        satisfied: 2,
        total: 2,
        open: [],
        unmerged: [],
      }),
    ).toMatchObject({ text: 'Ready', tone: 'ok', waitsFor: null });
  });

  test('Waiting names the open ones', () => {
    const chip = readinessChip({
      state: 'waiting',
      satisfied: 1,
      total: 3,
      open: [ref(84, 'in_progress'), ref(86, 'todo')],
      unmerged: [],
    });
    expect(chip).toEqual({
      text: 'Waiting · 1 of 3',
      tone: 'warn',
      title: 'Waits for C-84 and C-86. 1 of 3 ready.',
      waitsFor: 'Waits for C-84 and C-86',
    });
  });

  test('Blocked names the unmerged ones (C-417)', () => {
    const unmerged = [ref(1, 'finished'), ref(2, 'finished')];
    const readiness = {
      state: 'blocked' as const,
      satisfied: 2,
      total: 2,
      open: [],
      unmerged,
    };
    expect(readinessChip(readiness)).toEqual({
      text: 'Blocked · merge one of C-1, C-2',
      tone: 'warn',
      title:
        'C-1 and C-2 are not merged yet; a card branches from one dependency only.',
      waitsFor:
        'C-1 and C-2 are not merged yet; a card branches from one dependency only',
    });
    expect(autoRunNote(true, readiness)).toContain('Will not start');
  });

  test('the Auto-run note says what will start the card', () => {
    const waiting = {
      state: 'waiting' as const,
      satisfied: 1,
      total: 2,
      open: [ref(84, 'in_progress')],
      unmerged: [],
    };
    expect(autoRunNote(true, waiting)).toBe(
      'Will start automatically once C-84 has a ready pull request.',
    );
    expect(autoRunNote(false, waiting)).toBe(
      'Nothing starts on its own. Press Run when you are ready.',
    );
    expect(
      autoRunNote(true, {
        state: 'ready',
        satisfied: 2,
        total: 2,
        open: [],
        unmerged: [],
      }),
    ).toContain('Press Run');
  });
});
