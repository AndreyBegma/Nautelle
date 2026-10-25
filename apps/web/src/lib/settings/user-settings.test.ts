import { describe, expect, test } from 'bun:test';
import { preselectedModel } from './user-settings';

describe('the planning model New Card and New Plan preselect (#337 D9)', () => {
  test('is the person’s setting', () => {
    expect(
      preselectedModel({ planningModel: 'opus', toolUseTimeoutMinutes: null }),
    ).toBe('opus');
  });

  test('is the default while the setting loads or when it cannot be read', () => {
    expect(preselectedModel(undefined)).toBe('sonnet');
    expect(
      preselectedModel({ planningModel: '', toolUseTimeoutMinutes: null }),
    ).toBe('sonnet');
  });
});
