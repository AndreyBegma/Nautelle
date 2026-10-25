import { describe, expect, test } from 'bun:test';
import type { ToolRuleView } from '@nautelle/shared';
import {
  formatMinutes,
  parseTimeoutMinutes,
  sortToolRules,
  timeoutError,
} from './away-mode';

describe('the tool-use timeout field (C-401)', () => {
  test('takes whole minutes from 1 to 720, and empty as not set', () => {
    expect(parseTimeoutMinutes('')).toBeNull();
    expect(parseTimeoutMinutes('  ')).toBeNull();
    expect(parseTimeoutMinutes('1')).toBe(1);
    expect(parseTimeoutMinutes(' 720 ')).toBe(720);
    for (const bad of ['0', '721', '1.5', '-5', 'abc', '5m']) {
      expect(parseTimeoutMinutes(bad)).toBeUndefined();
      expect(timeoutError(bad)).toMatch(/1 to 720/);
    }
    expect(timeoutError('')).toBeUndefined();
    expect(timeoutError('240')).toBeUndefined();
  });

  test('reads minutes as hours and minutes', () => {
    expect(formatMinutes(1)).toBe('1 minute');
    expect(formatMinutes(5)).toBe('5 minutes');
    expect(formatMinutes(60)).toBe('1 hour');
    expect(formatMinutes(150)).toBe('2 hours 30 minutes');
    expect(formatMinutes(720)).toBe('12 hours');
  });
});

describe('sortToolRules (C-401)', () => {
  const rule = (
    id: string,
    scope: ToolRuleView['scope'],
    createdAt: string,
  ): ToolRuleView => ({
    id,
    scope,
    sessionId: scope === 'session' ? 's' : null,
    toolName: 'Bash',
    ruleContent: 'npm test:*',
    label: 'Bash(npm test:*)',
    createdById: null,
    createdByEmail: null,
    sourceRequestId: null,
    useCount: 0,
    lastUsedAt: null,
    createdAt,
  });

  test('lists the project rules first, newest first within a scope', () => {
    const sorted = sortToolRules([
      rule('s-old', 'session', '2026-10-01T00:00:00.000Z'),
      rule('p-old', 'project', '2026-10-01T00:00:00.000Z'),
      rule('s-new', 'session', '2026-10-02T00:00:00.000Z'),
      rule('p-new', 'project', '2026-10-02T00:00:00.000Z'),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([
      'p-new',
      'p-old',
      's-new',
      's-old',
    ]);
  });
});
