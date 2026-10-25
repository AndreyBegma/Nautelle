import { describe, expect, test } from 'bun:test';
import type {
  ProjectDetail,
  ProjectReadinessView,
  ReadinessBlocker,
  TerminalSetupItem,
  TerminalSetupView,
} from '@nautelle/shared';
import { type ReadyFacts, readyChecks, readySummary } from './ready-to-run';

const project = (overrides: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  displayName: 'Widget',
  repo: 'acme/widget',
  rootPath: '/srv/widget',
  runnerId: 'r1',
  runnerName: 'Build box',
  runnerStatus: 'online',
  base: 'develop',
  docsKind: null,
  role: 'admin',
  watchRefusal: null,
  baseBranch: 'develop',
  baseSource: 'config',
  baseOverride: null,
  readyLabelOverride: null,
  defaultProfileId: 'prof1',
  mergeApproval: false,
  codeSentinelConfig: null,
  hasClaudeMd: true,
  hasAgentsMd: false,
  hasDemoflowConfig: true,
  canPush: true,
  lastInspectedAt: '2026-10-25T00:00:00Z',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  docsSource: null,
  runnerCommands: null,
  ...overrides,
});

const readiness = (run: ReadinessBlocker[] = []): ProjectReadinessView => ({
  profile: { key: 'claude', label: 'Claude', source: 'default' },
  suggestion: null,
  actions: { design: [], run, capture: [], spec_on_run: [], plan: [] },
});

const plugin = (
  state: TerminalSetupItem['state'],
  profileKey = 'claude',
): TerminalSetupItem => ({
  id: 'plugin',
  state,
  optional: false,
  profileKey,
  steps: [],
});

const setup = (items: TerminalSetupItem[]): TerminalSetupView => ({
  items,
  otherProfiles: [],
  ignoredProfileKeys: [],
  complete: false,
  todo: 0,
  closing: '',
});

const facts = (overrides: Partial<ReadyFacts> = {}): ReadyFacts => ({
  project: project(),
  readiness: readiness(),
  terminalSetup: setup([plugin('done')]),
  demos: { enabled: true, uiPaths: [], telegram: false },
  isAdmin: true,
  ...overrides,
});

const byId = (input: ReadyFacts) =>
  Object.fromEntries(readyChecks(input).map((check) => [check.id, check]));

describe('Ready to run (C-395)', () => {
  test('a project with everything in place is green throughout', () => {
    const checks = readyChecks(facts());
    expect(checks.map((check) => [check.id, check.state])).toEqual([
      ['runner', 'ok'],
      ['profile', 'ok'],
      ['base', 'ok'],
      ['push', 'ok'],
      ['plugin', 'ok'],
      ['demos', 'ok'],
    ]);
    expect(readySummary(checks)).toEqual({
      ready: 6,
      total: 6,
      blocked: false,
      headline: 'Everything a card needs is in place.',
    });
  });

  test('a project that cannot run says why at the top', () => {
    const checks = readyChecks(
      facts({
        project: project({ runnerStatus: 'offline' }),
        readiness: readiness([
          { code: 'no_profile', reason: 'none', source: null },
          { code: 'runner_offline' },
        ]),
      }),
    );
    const summary = readySummary(checks);
    expect(summary).toMatchObject({ ready: 4, total: 6, blocked: true });
    expect(summary.headline).toBe(
      'Cards cannot run here yet: runner online, runtime profile.',
    );
    const [runner, profile] = checks;
    expect(runner).toMatchObject({
      state: 'gap',
      detail: 'Build box is offline, so nothing can run.',
      fix: { href: '/admin/runners' },
    });
    expect(profile).toMatchObject({
      state: 'gap',
      detail: 'This project has no runtime profile.',
      fix: {
        label: 'Choose a profile',
        href: '/projects/p1/settings?tab=general',
      },
    });
  });

  test('a member who is not an admin gets the reason without a fix', () => {
    const checks = byId(
      facts({
        isAdmin: false,
        project: project({ role: 'operator', baseSource: 'default' }),
        readiness: readiness([
          { code: 'no_profile', reason: 'none', source: null },
        ]),
      }),
    );
    expect(checks.profile?.fix).toBeUndefined();
    expect(checks.profile?.detail).toContain('Ask an admin');
    expect(checks.base).toMatchObject({ state: 'gap' });
    expect(checks.base?.fix).toBeUndefined();
  });

  test('a guessed base branch links General; an override or detection is fine', () => {
    expect(
      byId(facts({ project: project({ baseSource: 'default' }) })).base,
    ).toMatchObject({
      state: 'gap',
      blocking: false,
      fix: { href: '/projects/p1/settings?tab=general' },
    });
    expect(
      byId(
        facts({
          project: project({ baseSource: 'default', baseOverride: 'main' }),
        }),
      ).base,
    ).toMatchObject({ state: 'ok', detail: 'main, set in General' });
  });

  test('push access comes from the runner; unknown until it reports', () => {
    expect(
      byId(facts({ project: project({ canPush: false }) })).push,
    ).toMatchObject({ state: 'gap', blocking: true });
    expect(
      byId(facts({ project: project({ canPush: null }) })).push,
    ).toMatchObject({ state: 'unknown' });
  });

  test('the plugin: a missing profile names it and links Sessions', () => {
    expect(
      byId(
        facts({
          terminalSetup: setup([plugin('done'), plugin('todo', 'claude-work')]),
        }),
      ).plugin,
    ).toMatchObject({
      state: 'gap',
      detail:
        'Not installed in claude-work, so terminal sessions do not reach the Board.',
      fix: { href: '/projects/p1/settings?tab=sessions' },
    });
    expect(
      byId(facts({ terminalSetup: setup([plugin('unknown')]) })).plugin,
    ).toMatchObject({ state: 'unknown' });
  });

  test('demo videos: off is not a gap; on without a config is', () => {
    const off = byId(
      facts({ demos: { enabled: false, uiPaths: [], telegram: false } }),
    ).demos;
    expect(off).toMatchObject({ state: 'off', fix: { label: 'Turn on' } });
    expect(
      byId(facts({ project: project({ hasDemoflowConfig: false }) })).demos,
    ).toMatchObject({
      state: 'gap',
      fix: { href: '/projects/p1/settings?tab=demo-videos' },
    });
    const summary = readySummary(
      readyChecks(facts({ project: project({ hasDemoflowConfig: false }) })),
    );
    expect(summary).toMatchObject({ ready: 5, blocked: false });
  });

  test('not loaded yet reads as checking, never as a gap', () => {
    const checks = byId(
      facts({ readiness: null, terminalSetup: null, demos: null }),
    );
    expect(checks.profile?.state).toBe('unknown');
    expect(checks.plugin?.state).toBe('unknown');
    expect(checks.demos?.state).toBe('unknown');
  });
});
