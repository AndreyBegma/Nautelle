import { describe, expect, it } from 'bun:test';
import {
  LABEL_HUE_MAX,
  LABEL_HUE_MIN,
  LABEL_NAME_PATTERN,
  LABEL_PATTERN_MAX,
  labelPatternProblem,
  STARTER_LABEL_RULES,
  STARTER_LABELS,
} from './labels';

describe('labelPatternProblem', () => {
  it.each([
    'apps/web/**',
    '.woodpecker/**',
    'docs/*.md',
    'apps/**/test/?.ts',
    'README.md',
  ])('accepts %s', (pattern) => {
    expect(labelPatternProblem(pattern)).toBeNull();
  });

  it.each([
    '',
    ' apps/**',
    '/apps/**',
    'apps//web',
    'apps/web/',
    '../secrets',
    'apps/./web',
    'apps/**web',
    'apps\\web',
    'apps/[ab]',
    'apps/{web,api}',
    'apps/\u0007',
    'a'.repeat(LABEL_PATTERN_MAX + 1),
  ])('refuses %j', (pattern) => {
    expect(labelPatternProblem(pattern)).toEqual(expect.any(String));
  });
});

describe('the starter set', () => {
  it('has kebab names and identity hues', () => {
    for (const label of STARTER_LABELS) {
      expect(label.name).toMatch(LABEL_NAME_PATTERN);
      expect(label.hue).toBeGreaterThanOrEqual(LABEL_HUE_MIN);
      expect(label.hue).toBeLessThanOrEqual(LABEL_HUE_MAX);
    }
  });

  it('names only starter labels in combines and rules', () => {
    const names = new Set(STARTER_LABELS.map((l) => l.name));
    for (const label of STARTER_LABELS) {
      for (const part of label.combines) expect(names.has(part)).toBe(true);
    }
    for (const rule of STARTER_LABEL_RULES) {
      expect(names.has(rule.label)).toBe(true);
      expect(labelPatternProblem(rule.pattern)).toBeNull();
    }
  });
});
