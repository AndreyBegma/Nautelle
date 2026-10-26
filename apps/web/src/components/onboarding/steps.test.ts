import { describe, expect, test } from 'bun:test';
import type { MyOnboardingFacts, OnboardingFacts } from '@nautelle/shared';
import { currentStep, gettingStarted, operatorGettingStarted } from './steps';

const ids = (state: ReturnType<typeof gettingStarted>, done: boolean) =>
  state.steps.filter((s) => !s.optional && s.done === done).map((s) => s.id);

const PROJECT = {
  id: 'p1',
  displayName: 'widget',
  runnerId: 'r1',
  rootPath: '/srv/dev/widget',
};

const NOTHING: OnboardingFacts = {
  profile: false,
  plugin: false,
  pushCheck: null,
  firstCard: 'none',
  githubApp: false,
  teammates: false,
  aiProvider: false,
  notifications: false,
};

const NEW_OPERATOR: MyOnboardingFacts = {
  notifications: false,
  cardRun: false,
  projectCount: 0,
};

const me = (overrides: Partial<MyOnboardingFacts> = {}): MyOnboardingFacts => ({
  ...NEW_OPERATOR,
  ...overrides,
});

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  ...NOTHING,
  ...overrides,
});

const PASSED = {
  projectId: 'p1',
  ok: true,
  remote: 'git@github.com:acme/widget.git',
  message: 'accepts pushes.',
  checkedAt: '2026-10-25T00:00:00.000Z',
};

describe('gettingStarted', () => {
  test('a fresh install: nothing done, 0 of 7, opens on install', () => {
    const state = gettingStarted({
      runners: { kind: 'none' },
      projects: [],
      facts: facts(),
    });
    expect(state.done).toBe(0);
    expect(state.total).toBe(7);
    expect(state.complete).toBe(false);
    expect(currentStep(state)?.id).toBe('install');
  });

  test('a paired runner that is not running: installed, the next step keeps it online', () => {
    const state = gettingStarted({
      runners: {
        kind: 'offline',
        runners: [{ id: 'r1', name: 'laptop', hostname: null }],
      },
      projects: [],
      facts: facts(),
    });
    expect(ids(state, true)).toEqual(['install']);
    expect(currentStep(state)?.id).toBe('pair');
  });

  test('online but no project: the next step connects one', () => {
    const state = gettingStarted({
      runners: { kind: 'online', online: 1 },
      projects: [],
      facts: facts(),
    });
    expect(state.done).toBe(2);
    expect(currentStep(state)?.href).toBe('/projects?connect=1');
  });

  test('the project-scoped steps link to the first project', () => {
    const state = gettingStarted({
      runners: { kind: 'online', online: 1 },
      projects: [PROJECT],
      facts: facts(),
    });
    expect(currentStep(state)?.id).toBe('profile');
    expect(state.project?.id).toBe('p1');
    const href = (id: string) => state.steps.find((s) => s.id === id)?.href;
    expect(href('profile')).toBe('/projects/p1/settings?tab=general');
    expect(href('card')).toBe('/projects/p1/board');
  });

  test('each later step ticks from its fact', () => {
    const base = {
      runners: { kind: 'online', online: 1 } as const,
      projects: [PROJECT],
    };
    expect(
      currentStep(gettingStarted({ ...base, facts: facts({ profile: true }) }))
        ?.id,
    ).toBe('plugin');
    expect(
      currentStep(
        gettingStarted({
          ...base,
          facts: facts({ profile: true, plugin: true }),
        }),
      )?.id,
    ).toBe('push');
    // A failed push check is not done.
    expect(
      currentStep(
        gettingStarted({
          ...base,
          facts: facts({
            profile: true,
            plugin: true,
            pushCheck: { ...PASSED, ok: false },
          }),
        }),
      )?.id,
    ).toBe('push');
    expect(
      currentStep(
        gettingStarted({
          ...base,
          facts: facts({ profile: true, plugin: true, pushCheck: PASSED }),
        }),
      )?.id,
    ).toBe('card');
  });

  test('a first card with a pull request completes it; optional steps tick but do not count', () => {
    const state = gettingStarted({
      runners: { kind: 'online', online: 2 },
      projects: [PROJECT],
      facts: facts({
        profile: true,
        plugin: true,
        pushCheck: PASSED,
        firstCard: 'pr',
        githubApp: true,
        notifications: true,
      }),
    });
    expect(state.audience).toBe('admin');
    expect(state.complete).toBe(true);
    expect(state.done).toBe(7);
    expect(
      state.steps.filter((s) => s.optional).map((s) => [s.id, s.done]),
    ).toEqual([
      ['github', true],
      ['invite', false],
      ['ai', false],
      ['notifications', true],
    ]);
  });

  test('the AI provider and notifications steps link to their pages and tick from their facts', () => {
    const state = gettingStarted({
      runners: { kind: 'online', online: 1 },
      projects: [PROJECT],
      facts: facts({ aiProvider: true }),
    });
    const step = (id: string) => state.steps.find((s) => s.id === id);
    expect(step('ai')).toMatchObject({
      optional: true,
      done: true,
      href: '/admin/ai-providers',
    });
    expect(step('notifications')).toMatchObject({
      optional: true,
      done: false,
      href: '/account/notifications',
    });
    // Optional: neither counts towards "N of 7".
    expect(state.total).toBe(7);
  });

  test('a project with its runner offline is not complete', () => {
    const state = gettingStarted({
      runners: { kind: 'offline', runners: [] },
      projects: [PROJECT],
      facts: facts({ profile: true }),
    });
    expect(state.complete).toBe(false);
    expect(currentStep(state)?.id).toBe('pair');
  });

  test('unknown facts are never read as done', () => {
    const state = gettingStarted({
      runners: { kind: 'unknown' },
      projects: [],
      facts: null,
    });
    expect(ids(state, true)).toEqual([]);
    expect(state.steps.every((s) => !s.done)).toBe(true);
  });
});

describe('operatorGettingStarted', () => {
  const SHARED = [{ id: 'p1' }];

  test('a new operator with no project: three steps, 0 of 3, opens on the project', () => {
    const state = operatorGettingStarted({ projects: [], me: me() });
    expect(state.audience).toBe('operator');
    expect(state.steps.map((s) => [s.id, s.optional])).toEqual([
      ['open', false],
      ['notifications', false],
      ['card', false],
    ]);
    expect(state.done).toBe(0);
    expect(state.total).toBe(3);
    expect(currentStep(state)).toMatchObject({
      id: 'open',
      href: '/projects',
    });
    // No project to run a card in yet.
    expect(state.steps.find((s) => s.id === 'card')?.href).toBeUndefined();
    expect(state.project).toBeNull();
  });

  test('a shared project: the next step turns on notifications, the card step links to its Board', () => {
    const state = operatorGettingStarted({
      projects: SHARED,
      me: me({ projectCount: 1 }),
    });
    expect(ids(state, true)).toEqual(['open']);
    expect(currentStep(state)).toMatchObject({
      id: 'notifications',
      href: '/account/notifications',
    });
    expect(state.steps.find((s) => s.id === 'card')?.href).toBe(
      '/projects/p1/board',
    );
  });

  test('notifications on and a card run complete it', () => {
    const state = operatorGettingStarted({
      projects: SHARED,
      me: me({ projectCount: 1, notifications: true, cardRun: true }),
    });
    expect(state.done).toBe(3);
    expect(state.complete).toBe(true);
    expect(currentStep(state)).toBeUndefined();
  });

  test('facts not loaded are never read as done', () => {
    const state = operatorGettingStarted({ projects: SHARED, me: null });
    expect(state.steps.every((s) => !s.done)).toBe(true);
    expect(state.complete).toBe(false);
  });
});
