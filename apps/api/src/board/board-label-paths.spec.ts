import { labelsOfPaths } from './board-label-paths';

const labels = [
  { id: 'fe', combines: [] },
  { id: 'be', combines: [] },
  { id: 'full', combines: ['fe', 'be'] },
  { id: 'docs', combines: [] },
  { id: 'infra', combines: [] },
];
const rules = [
  { pattern: 'apps/web/**', labelId: 'fe' },
  { pattern: 'apps/api/**', labelId: 'be' },
  { pattern: 'docs/**', labelId: 'docs' },
  { pattern: 'deploy/**', labelId: 'infra' },
  { pattern: '.woodpecker/**', labelId: 'infra' },
];

describe('labelsOfPaths (C-501, ADR-0125 D7)', () => {
  it('gives the label of each rule a changed path matches', () => {
    expect(labelsOfPaths(['apps/web/src/a.tsx'], rules, labels)).toEqual([
      'fe',
    ]);
    expect(labelsOfPaths(['apps/api/src/a.ts'], rules, labels)).toEqual(['be']);
    expect(labelsOfPaths(['docs/specs/a.md'], rules, labels)).toEqual(['docs']);
  });

  it('gives one label for two rules of it', () => {
    expect(
      labelsOfPaths(
        ['.woodpecker/ci.yml', 'deploy/compose.yml'],
        rules,
        labels,
      ),
    ).toEqual(['infra']);
  });

  it('replaces the parts with the combination when all of them match', () => {
    expect(
      labelsOfPaths(['apps/web/a.tsx', 'apps/api/a.ts'], rules, labels),
    ).toEqual(['full']);
  });

  it('gives docs and backend side by side', () => {
    expect(
      labelsOfPaths(['docs/a.md', 'apps/api/b.ts'], rules, labels),
    ).toEqual(['be', 'docs']);
  });

  it('does not match a folder name without a file below it', () => {
    expect(labelsOfPaths(['apps/web'], rules, labels)).toEqual([]);
  });

  it('keeps the other labels beside a combination', () => {
    expect(
      labelsOfPaths(
        ['docs/a.md', 'apps/web/a.tsx', 'apps/api/a.ts'],
        rules,
        labels,
      ),
    ).toEqual(['full', 'docs']);
  });

  it('does not combine while a part is missing', () => {
    expect(
      labelsOfPaths(['apps/web/a.tsx', 'docs/a.md'], rules, labels),
    ).toEqual(['fe', 'docs']);
  });

  it('gives nothing when no rule matches, or there are no paths or rules', () => {
    expect(labelsOfPaths(['README.md'], rules, labels)).toEqual([]);
    expect(labelsOfPaths([], rules, labels)).toEqual([]);
    expect(labelsOfPaths(['apps/web/a.tsx'], [], labels)).toEqual([]);
  });

  it('matches * inside a segment and ? as one character', () => {
    const only = (pattern: string) => [{ pattern, labelId: 'docs' }];
    const hit = (pattern: string, path: string) =>
      labelsOfPaths([path], only(pattern), labels).length === 1;
    expect(hit('apps/*/a.ts', 'apps/web/a.ts')).toBe(true);
    expect(hit('apps/*/a.ts', 'apps/web/src/a.ts')).toBe(false);
    expect(hit('*.md', 'README.md')).toBe(true);
    expect(hit('*.md', 'docs/README.md')).toBe(false);
    expect(hit('a?.ts', 'ab.ts')).toBe(true);
    expect(hit('a?.ts', 'a/.ts')).toBe(false);
  });

  it('matches ** across folders, also none, and a last ** below the folder', () => {
    const only = (pattern: string) => [{ pattern, labelId: 'docs' }];
    const hit = (pattern: string, path: string) =>
      labelsOfPaths([path], only(pattern), labels).length === 1;
    expect(hit('apps/**/test', 'apps/test')).toBe(true);
    expect(hit('apps/**/test', 'apps/web/src/test')).toBe(true);
    expect(hit('apps/**/test', 'apps/web/tests')).toBe(false);
    expect(hit('docs/**', 'docs/a/b/c.md')).toBe(true);
    expect(hit('docs/**', 'docsx/a.md')).toBe(false);
    expect(hit('**', 'any/where.md')).toBe(true);
  });

  it('reads . and other regular expression characters literally', () => {
    const only = [{ pattern: 'a.b+c/**', labelId: 'docs' }];
    expect(labelsOfPaths(['a.b+c/x'], only, labels)).toEqual(['docs']);
    expect(labelsOfPaths(['axb+c/x'], only, labels)).toEqual([]);
  });

  it('stops on labels that combine each other', () => {
    const loop = [
      { id: 'a', combines: ['b'] },
      { id: 'b', combines: ['a'] },
    ];
    const both = [
      { pattern: 'a/**', labelId: 'a' },
      { pattern: 'b/**', labelId: 'b' },
    ];
    expect(labelsOfPaths(['a/x', 'b/x'], both, loop)).toHaveLength(1);
  });
});
