import { describe, expect, it } from 'bun:test';
import type {
  InboxFailedItem,
  InboxItemView,
  InboxMergeItem,
  InboxSetupItem,
} from '@nautelle/shared';
import { card } from '../board/fixtures';
import { CI_STILL_FAILING_TEXT } from '../board/shipping';
import {
  countInboxKinds,
  EMPTY_INBOX_FILTERS,
  emptyKindText,
  failedReasonText,
  filterInboxItems,
  groupInboxByProject,
  inboxBadge,
  inboxFiltersFromSearch,
  inboxFiltersSearch,
  inboxItemHref,
  inboxItemTitle,
  inboxLinkText,
  inboxMeta,
  inboxPreview,
} from './format';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const merge = (
  projectId: string,
  number: number,
  minutes: number,
): InboxMergeItem => ({
  id: `merge:${projectId}-${number}`,
  kind: 'merge',
  projectId,
  projectName: projectId.toUpperCase(),
  since: ago(minutes),
  card: card(number, 'finished'),
  demo: null,
});

const failed = (
  reason: InboxFailedItem['reason'],
  extra: Partial<InboxFailedItem> = {},
): InboxFailedItem => ({
  id: `failed:${reason}`,
  kind: 'failed',
  projectId: 'a',
  projectName: 'A',
  since: ago(1),
  card: card(3, 'finished'),
  reason,
  message: null,
  retry: null,
  ...extra,
});

const setup: InboxSetupItem = {
  id: 'setup:b:runner_offline',
  kind: 'setup',
  projectId: 'b',
  projectName: 'B',
  since: ago(30),
  blocker: { code: 'runner_offline' },
};

// Oldest first, as `GET /inbox` sends them.
const ITEMS: InboxItemView[] = [
  merge('a', 1, 120),
  setup,
  merge('a', 2, 10),
  failed('collect_failed', { projectId: 'c', projectName: 'C' }),
];

describe('inbox filters in the URL', () => {
  it('reads a known kind and the project, and drops an unknown kind', () => {
    expect(
      inboxFiltersFromSearch(new URLSearchParams('kind=merge&project=p1')),
    ).toEqual({ kind: 'merge', projectId: 'p1' });
    expect(inboxFiltersFromSearch(new URLSearchParams('kind=nope'))).toEqual(
      EMPTY_INBOX_FILTERS,
    );
  });

  it('writes only what is set, and round-trips', () => {
    expect(inboxFiltersSearch(EMPTY_INBOX_FILTERS)).toBe('');
    const search = inboxFiltersSearch({ kind: 'design', projectId: 'p1' });
    expect(search).toBe('?kind=design&project=p1');
    expect(inboxFiltersFromSearch(new URLSearchParams(search))).toEqual({
      kind: 'design',
      projectId: 'p1',
    });
  });
});

describe('filterInboxItems and countInboxKinds', () => {
  it('lets through the kind and the project chosen, keeping the order', () => {
    expect(
      filterInboxItems(ITEMS, { kind: 'merge', projectId: '' }).map(
        (i) => i.id,
      ),
    ).toEqual(['merge:a-1', 'merge:a-2']);
    expect(
      filterInboxItems(ITEMS, { kind: '', projectId: 'b' }).map((i) => i.id),
    ).toEqual(['setup:b:runner_offline']);
    expect(filterInboxItems(ITEMS, EMPTY_INBOX_FILTERS)).toHaveLength(4);
  });

  it('counts every kind, zero included', () => {
    expect(countInboxKinds(ITEMS)).toEqual({
      design: 0,
      question: 0,
      merge: 2,
      failed: 1,
      permission: 0,
      setup: 1,
    });
  });
});

describe('groupInboxByProject', () => {
  it('orders the projects by their oldest item and keeps each group in order', () => {
    expect(
      groupInboxByProject(ITEMS).map((g) => [
        g.projectName,
        g.items.map((i) => i.id),
      ]),
    ).toEqual([
      ['A', ['merge:a-1', 'merge:a-2']],
      ['B', ['setup:b:runner_offline']],
      ['C', ['failed:collect_failed']],
    ]);
  });
});

describe('inboxMeta', () => {
  it('counts the items and projects and says the oldest age', () => {
    expect(inboxMeta(ITEMS, NOW)).toBe('4 waiting · 3 projects · Oldest 2 h');
    expect(inboxMeta([merge('a', 1, 5)], NOW)).toBe(
      '1 waiting · 1 project · Oldest 5 min',
    );
    expect(inboxMeta([], NOW)).toBeNull();
  });
});

describe('emptyKindText', () => {
  it('names the kind and what else waits', () => {
    expect(emptyKindText('design', 5)).toEqual({
      title: 'No designs to approve',
      description: '5 other things wait on you.',
    });
    expect(emptyKindText('merge', 1).description).toBe(
      '1 other thing waits on you.',
    );
  });
});

describe('inboxBadge', () => {
  it('shows the total, and nothing at zero', () => {
    expect(inboxBadge(0)).toBeUndefined();
    expect(inboxBadge(3)).toEqual({
      count: 3,
      tone: 'warn',
      label: '3 waiting in the Inbox',
    });
  });
});

describe('inboxLinkText', () => {
  it('adds the count while something waits', () => {
    expect(inboxLinkText(0)).toBe('Open Inbox');
    expect(inboxLinkText(4)).toBe('Open Inbox (4)');
  });
});

describe('failedReasonText', () => {
  it('words each reason', () => {
    expect(failedReasonText(failed('collect_failed'))).toBe(
      'Its work could not be pushed',
    );
    expect(failedReasonText(failed('auto_run_failed'))).toBe(
      'An automatic run was refused',
    );
    expect(failedReasonText(failed('ci_still_failing'))).toBe(
      CI_STILL_FAILING_TEXT,
    );
  });
});

describe('inboxItemHref and inboxItemTitle', () => {
  it('opens a card on the Board, a design in its viewer, a blocker in Settings', () => {
    expect(inboxItemHref(merge('a', 1, 1))).toBe('/projects/a/board?card=1');
    expect(
      inboxItemHref({
        id: 'design:x',
        kind: 'design',
        projectId: 'a',
        projectName: 'A',
        since: ago(1),
        card: card(4, 'todo'),
        revisions: [],
      }),
    ).toBe('/projects/a/board/cards/4/design');
    expect(inboxItemHref(setup)).toBe('/projects/b/settings');
  });

  it('titles a card by its title and a blocker by its name', () => {
    expect(inboxItemTitle(merge('a', 7, 1))).toBe('Card 7');
    expect(inboxItemTitle(setup)).toBe('Runner offline');
  });
});

describe('inboxPreview', () => {
  it('keeps the oldest few and counts the rest', () => {
    expect(inboxPreview({ items: ITEMS }, 3)).toMatchObject({
      items: ITEMS.slice(0, 3),
      more: 1,
    });
    expect(inboxPreview({ items: ITEMS }).more).toBe(0);
  });
});
