import { describe, expect, test } from 'bun:test';
import { shouldReloadOnRunUpdate } from './profile-live';

const update = (id: string) => ({
  event: 'run.updated',
  data: { id, status: 'succeeded' },
});

describe('shouldReloadOnRunUpdate', () => {
  test('reloads on the build run settling', () => {
    expect(shouldReloadOnRunUpdate(update('run-1'), true, 'run-1')).toBe(true);
  });

  test('ignores another run', () => {
    expect(shouldReloadOnRunUpdate(update('run-2'), true, 'run-1')).toBe(false);
  });

  test('ignores other events', () => {
    const message = { event: 'card.updated', data: update('run-1').data };
    expect(shouldReloadOnRunUpdate(message, true, 'run-1')).toBe(false);
  });

  test('ignores frames while the profile is not building', () => {
    expect(shouldReloadOnRunUpdate(update('run-1'), false, 'run-1')).toBe(
      false,
    );
  });

  test('ignores frames when no build run is known', () => {
    expect(shouldReloadOnRunUpdate(update('run-1'), true, null)).toBe(false);
  });

  test('ignores malformed data', () => {
    for (const data of [null, 'run-1', {}, { id: 'run-1' }, { id: 1 }]) {
      expect(
        shouldReloadOnRunUpdate({ event: 'run.updated', data }, true, 'run-1'),
      ).toBe(false);
    }
  });
});
