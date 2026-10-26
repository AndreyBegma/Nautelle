import { describe, expect, test } from 'bun:test';
import type {
  PlanSummary,
  ProjectSummary,
  RunSummary,
  SessionSummary,
  WorkCardItem,
} from '@nautelle/shared';
import { visibleNav } from './nav';
import {
  askItem,
  isCardReference,
  lookupWanted,
  type PaletteInput,
  paletteGroups,
} from './palette';

const project = (id: string, displayName: string, role = 'operator') =>
  ({ id, displayName, repo: `acme/${id}`, role }) as ProjectSummary;

const PROJECTS = [project('p1', 'Nautelle'), project('p2', 'Glass')];

function input(overrides: Partial<PaletteInput> = {}): PaletteInput {
  const path = overrides.projectId ? `/projects/${overrides.projectId}` : '/';
  return {
    query: '',
    role: 'admin',
    sections: visibleNav('admin', path),
    projects: PROJECTS,
    projectId: null,
    recent: { sessions: [], runs: [] },
    plans: [],
    themeLabel: 'System',
    ...overrides,
  };
}

const titles = (groups: ReturnType<typeof paletteGroups>) =>
  groups.map((group) => group.title);
const labelsIn = (groups: ReturnType<typeof paletteGroups>, id: string) =>
  groups.find((group) => group.id === id)?.items.map((item) => item.label) ??
  [];

const plan = (id: string, title: string, updatedAt: string) =>
  ({ id, projectId: 'p1', title, updatedAt }) as PlanSummary;

describe('paletteGroups: Plans', () => {
  const plans = [
    plan('a', 'Old plan', '2026-10-01T00:00:00Z'),
    plan('b', 'Ship the shell', '2026-10-14T00:00:00Z'),
  ];

  test('the project plans are a group, newest first, opening the plan', () => {
    const groups = paletteGroups(input({ projectId: 'p1', plans }));
    expect(labelsIn(groups, 'plans')).toEqual(['Ship the shell', 'Old plan']);
    const first = groups.find((group) => group.id === 'plans')?.items[0];
    expect(first?.id).toBe('go:/projects/p1/planner/b');
  });

  test('a query narrows the plans, and "plan" finds them all', () => {
    expect(
      labelsIn(
        paletteGroups(input({ projectId: 'p1', plans, query: 'shell' })),
        'plans',
      ),
    ).toEqual(['Ship the shell']);
    expect(
      labelsIn(
        paletteGroups(input({ projectId: 'p1', plans, query: 'plan' })),
        'plans',
      ),
    ).toHaveLength(2);
  });

  test('no plans, no group', () => {
    expect(titles(paletteGroups(input({ projectId: 'p1' })))).not.toContain(
      'Plans',
    );
  });

  test('the admin page reads "Planner instructions"', () => {
    expect(labelsIn(paletteGroups(input()), 'admin')).toContain(
      'Planner instructions',
    );
  });
});

describe('paletteGroups', () => {
  test('group titles are unique and no row repeats its group title', () => {
    const groups = paletteGroups(input({ projectId: 'p1' }));
    expect(new Set(titles(groups)).size).toBe(groups.length);
    for (const group of groups) {
      for (const item of group.items) expect(item.hint).not.toBe(group.title);
    }
  });

  test('inside a project, its pages read "Project › Page"', () => {
    const groups = paletteGroups(input({ projectId: 'p1' }));
    expect(labelsIn(groups, 'project-pages')).toContain('Nautelle › Fleet');
    expect(labelsIn(groups, 'project-pages').join()).not.toContain('Glass');
  });

  test('a query finds the pages of any project', () => {
    const groups = paletteGroups(input({ query: 'glass fleet' }));
    expect(labelsIn(groups, 'project-pages')).toEqual(['Glass › Fleet']);
  });

  test('outside a project and with no query, no project pages', () => {
    expect(labelsIn(paletteGroups(input()), 'project-pages')).toEqual([]);
  });

  test('recent sessions and runs are listed by name', () => {
    const groups = paletteGroups(
      input({
        recent: {
          sessions: [
            {
              id: 's1',
              title: 'Fix the login loop',
              slotName: null,
              projectName: 'Nautelle',
            } as SessionSummary,
          ],
          runs: [
            {
              id: 'r1',
              projectId: 'p1',
              issue: 155,
              slot: 'i155',
              title: null,
            } as RunSummary,
          ],
        },
      }),
    );
    const recent = groups.find((group) => group.id === 'recent');
    expect(recent?.items.map((item) => [item.id, item.label])).toEqual([
      ['go:/sessions/s1', 'Fix the login loop'],
      ['go:/projects/p1/activity?tab=runs&run=r1', '#155 · i155'],
    ]);
  });

  test('a planner run shows as its plan, once for all its turns (#213)', () => {
    const turn = (id: string) =>
      ({
        id,
        kind: 'plan',
        projectId: 'p1',
        issue: null,
        slot: null,
        title: 'Plan decompose',
        planId: 'pl1',
      }) as RunSummary;
    const groups = paletteGroups(
      input({
        projectId: 'p1',
        plans: [
          {
            id: 'pl1',
            projectId: 'p1',
            title: 'CSV exporter',
            updatedAt: '2026-10-14T10:00:00.000Z',
          } as PlanSummary,
        ],
        recent: { sessions: [], runs: [turn('r2'), turn('r1')] },
      }),
    );
    const recent = groups.find((group) => group.id === 'recent');
    expect(recent?.items.map((item) => [item.id, item.label])).toEqual([
      ['go:/projects/p1/planner/pl1', 'CSV exporter'],
    ]);
  });

  test('the admin Settings is told apart from the project Settings by its group', () => {
    const groups = paletteGroups(input({ query: 'settings', projectId: 'p1' }));
    expect(labelsIn(groups, 'admin')).toEqual(['Settings']);
    expect(labelsIn(groups, 'project-pages')).toEqual([
      'Nautelle › Settings',
      'Glass › Settings',
    ]);
    expect(labelsIn(groups, 'pages')).not.toContain('Settings');
  });

  test('no hint repeats down a group', () => {
    for (const group of paletteGroups(input({ projectId: 'p1' }))) {
      const hints = group.items.map((item) => item.hint).filter(Boolean);
      if (hints.length > 1) expect(new Set(hints).size).toBeGreaterThan(1);
    }
  });

  test('Quick card is an action only where the person can create cards (C-391)', () => {
    const quick = (canQuickCard?: boolean) =>
      labelsIn(
        paletteGroups(input({ projectId: 'p1', canQuickCard })),
        'actions',
      );
    expect(quick(true)).toContain('Quick card');
    expect(quick(false)).not.toContain('Quick card');
    expect(quick(undefined)).not.toContain('Quick card');
  });

  test('typing finds Quick card among the actions', () => {
    const groups = paletteGroups(
      input({ projectId: 'p1', canQuickCard: true, query: 'quick' }),
    );
    expect(labelsIn(groups, 'actions')).toEqual(['Quick card']);
  });
});

describe('paletteGroups: Settings (C-395)', () => {
  const settingsIn = (groups: ReturnType<typeof paletteGroups>) =>
    groups.find((group) => group.id === 'settings')?.items ?? [];

  test('"budget" opens the Budget block of the current project', () => {
    const items = settingsIn(
      paletteGroups(input({ query: 'budget', projectId: 'p1' })),
    );
    expect(items[0]).toMatchObject({
      id: 'go:/projects/p1/settings?tab=budget',
      label: 'Budgets',
      hint: 'Cost › Budget',
    });
  });

  test('"profile" finds each block with a profile once', () => {
    const items = settingsIn(
      paletteGroups(input({ query: 'profile', projectId: 'p1' })),
    );
    expect(items.map((item) => item.label)).toContain(
      'Default runtime profile',
    );
    expect(items.map((item) => item.label)).toContain(
      'Orchestrator runtime profile',
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  test('nothing without a query or outside a project', () => {
    expect(settingsIn(paletteGroups(input({ projectId: 'p1' })))).toEqual([]);
    expect(settingsIn(paletteGroups(input({ query: 'budget' })))).toEqual([]);
  });
});

describe('askItem (#660)', () => {
  test('offers any query as a question, last', () => {
    const groups = paletteGroups(
      input({ query: 'Какие карточки упали на проверках?' }),
    );
    expect(groups.at(-1)).toMatchObject({
      id: 'ask',
      title: 'Ask the Board',
      items: [
        {
          id: 'ask:Какие карточки упали на проверках?',
          label: 'Ask the Board: “Какие карточки упали на проверках?”',
        },
      ],
    });
  });

  test('offers nothing for an empty or a one-letter query', () => {
    expect(askItem('')).toBeNull();
    expect(askItem(' a ')).toBeNull();
  });
});

describe('paletteGroups: create, Inbox and card lookup (C-393)', () => {
  const card = (overrides: Partial<WorkCardItem> = {}) =>
    ({
      source: 'card',
      projectId: 'p1',
      projectName: 'Nautelle',
      number: 12,
      label: 'C-12',
      title: 'Fix the login loop',
      column: 'finished',
      href: '/projects/p1/board?card=12',
      ...overrides,
    }) as WorkCardItem;

  test('inside a project, New card and New work come first', () => {
    const groups = paletteGroups(input({ projectId: 'p1' }));
    expect(groups[0]?.id).toBe('create');
    expect(groups[0]?.items.map((item) => [item.id, item.label])).toEqual([
      ['go:/projects/p1/board?quickCard=1', 'New card'],
      ['go:/projects/p1/board?newWork=1', 'New work'],
    ]);
  });

  test('outside a project each project you operate gets its own rows', () => {
    const groups = paletteGroups(
      input({
        projects: [project('p1', 'Nautelle'), project('p2', 'Glass', 'viewer')],
      }),
    );
    expect(labelsIn(groups, 'create')).toEqual(['New card', 'New work']);
    const many = paletteGroups(input());
    expect(labelsIn(many, 'create')).toEqual([
      'New card · Nautelle',
      'New work · Nautelle',
      'New card · Glass',
      'New work · Glass',
    ]);
  });

  test('a viewer is offered no create rows', () => {
    const groups = paletteGroups(
      input({
        projectId: 'p1',
        projects: [project('p1', 'Nautelle', 'viewer')],
      }),
    );
    expect(labelsIn(groups, 'create')).toEqual([]);
  });

  test('Inbox is a page to go to', () => {
    expect(
      labelsIn(paletteGroups(input({ query: 'inbox' })), 'pages'),
    ).toContain('Inbox');
  });

  test('a card named by its label gets Run, Accept and Open before the lookup', () => {
    const groups = paletteGroups(input({ query: 'C-12', cards: [card()] }));
    expect(groups.map((group) => group.id).slice(0, 2)).toEqual([
      'card-actions',
      'cards',
    ]);
    expect(groups[0]?.items.map((item) => [item.id, item.label])).toEqual([
      ['card:run:p1:12', 'Run C-12'],
      ['go:/projects/p1/board?card=12&accept=1', 'Accept C-12'],
      ['go:/projects/p1/board?card=12', 'Open C-12'],
    ]);
  });

  test('a running card is offered Stop, not Run', () => {
    const groups = paletteGroups(
      input({ query: '#41', cards: [card({ column: 'in_progress' })] }),
    );
    expect(labelsIn(groups, 'card-actions')).toEqual([
      'Stop C-12',
      'Open C-12',
    ]);
  });

  test('a viewer, a fleet card and an Inbox card can only open', () => {
    const viewer = [project('p1', 'Nautelle', 'viewer')];
    expect(
      labelsIn(
        paletteGroups(
          input({ query: 'C-12', projects: viewer, cards: [card()] }),
        ),
        'card-actions',
      ),
    ).toEqual(['Open C-12']);
    expect(
      labelsIn(
        paletteGroups(
          input({ query: 'C-12', cards: [card({ source: 'fleet' })] }),
        ),
        'card-actions',
      ),
    ).toEqual(['Open C-12']);
    expect(
      labelsIn(
        paletteGroups(
          input({
            query: 'C-12',
            cards: [card({ source: 'inbox', column: 'inbox' })],
          }),
        ),
        'card-actions',
      ),
    ).toEqual(['Open C-12']);
  });

  test('a title search lists the cards and offers actions only for a single hit', () => {
    const two = paletteGroups(
      input({
        query: 'login',
        cards: [card(), card({ number: 13, label: 'C-13' })],
      }),
    );
    expect(labelsIn(two, 'cards')).toEqual([
      'C-12 · Fix the login loop',
      'C-13 · Fix the login loop',
    ]);
    expect(labelsIn(two, 'card-actions')).toEqual([]);
    const one = paletteGroups(input({ query: 'login', cards: [card()] }));
    expect(labelsIn(one, 'card-actions')).toContain('Run C-12');
  });

  test('isCardReference reads C-12 and #41 but not words', () => {
    expect(isCardReference('c-12')).toBe(true);
    expect(isCardReference('#41')).toBe(true);
    expect(isCardReference('login')).toBe(false);
    expect(lookupWanted('a')).toBe(false);
    expect(lookupWanted('lo')).toBe(true);
  });
});
