import type { RailBadge } from '@andrewbehma/glass-ui/nav-rail';
import {
  INBOX_ITEM_KINDS,
  type InboxFailedItem,
  type InboxItemKind,
  type InboxItemView,
  type InboxView,
  isInboxItemKind,
} from '@nautelle/shared';
import { boardCardHref } from '../board/href';
import { NEEDS_PERSON_ROUND_TEXT, needsPersonText } from '../board/shipping';
import { cardDesignHref } from '../design/href';
import type { ChipDef, FilterCodec } from '../filters/url-filters';
import { formatAge } from '../fleet/format';
import { approvalsHref } from '../queue/tabs';

/**
 * The Inbox page (C-390, ADR-0100): what `GET /inbox` returned, filtered,
 * grouped and worded. Pure, so the rules are tested without a page.
 */

export const INBOX_HREF = '/inbox';

/** The kind filter's segments, in the page's order; `''` is "All". */
export const INBOX_KIND_LABEL: Record<InboxItemKind, string> = {
  design: 'Designs',
  question: 'Questions',
  merge: 'Merges',
  failed: 'Failed',
  permission: 'Permissions',
  setup: 'Setup',
};

/** One item's tag on its row. */
export const INBOX_ITEM_TAG: Record<InboxItemKind, string> = {
  design: 'Design',
  question: 'Question',
  merge: 'Merge',
  failed: 'Needs you',
  permission: 'Permission',
  setup: 'Setup',
};

/** What an empty kind filter says. */
const EMPTY_KIND_TITLE: Record<InboxItemKind, string> = {
  design: 'No designs to approve',
  question: 'No questions from agents',
  merge: 'No pull requests to merge',
  failed: 'No cards need you',
  permission: 'No permission requests',
  setup: 'No setup blockers',
};

/** `?kind=merge&project=<id>`; `''` is "any". */
export interface InboxFilters {
  kind: InboxItemKind | '';
  projectId: string;
}

export const EMPTY_INBOX_FILTERS: InboxFilters = { kind: '', projectId: '' };

/** What the URL says; an unknown kind is "any". */
export function inboxFiltersFromSearch(params: URLSearchParams): InboxFilters {
  const kind = params.get('kind') ?? '';
  return {
    kind: isInboxItemKind(kind) ? kind : '',
    projectId: params.get('project') ?? '',
  };
}

/** `''` or `?…`; "any" is left out. */
export function inboxFiltersSearch(filters: InboxFilters): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.projectId) params.set('project', filters.projectId);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const INBOX_FILTER_CODEC: FilterCodec<InboxFilters> = {
  keys: ['kind', 'project'],
  parse: inboxFiltersFromSearch,
  search: inboxFiltersSearch,
};

/** The project filter as a chip; the kind is the segmented control's own. */
export const inboxChipDefs = (
  projectName: (id: string) => string,
): ChipDef<InboxFilters>[] => [
  {
    key: 'project',
    label: (f) => (f.projectId ? `Project: ${projectName(f.projectId)}` : null),
    clear: { projectId: '' },
  },
];

/** The items of the chosen project, before the kind filter (its counts). */
export const inboxItemsOfProject = (
  items: readonly InboxItemView[],
  projectId: string,
): InboxItemView[] =>
  projectId ? items.filter((item) => item.projectId === projectId) : [...items];

/** The items both filters let through, oldest first as the server sent them. */
export const filterInboxItems = (
  items: readonly InboxItemView[],
  filters: InboxFilters,
): InboxItemView[] =>
  inboxItemsOfProject(items, filters.projectId).filter(
    (item) => !filters.kind || item.kind === filters.kind,
  );

/** Items of each kind, for the segments' counts. */
export function countInboxKinds(
  items: readonly InboxItemView[],
): Record<InboxItemKind, number> {
  const counts = Object.fromEntries(
    INBOX_ITEM_KINDS.map((kind) => [kind, 0]),
  ) as Record<InboxItemKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

export interface InboxGroup {
  projectId: string;
  projectName: string;
  items: InboxItemView[];
}

/**
 * By project, the project whose item waits longest first; inside a group the
 * items keep their order. `items` is oldest first, so first sight is the
 * group's oldest item.
 */
export function groupInboxByProject(
  items: readonly InboxItemView[],
): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();
  for (const item of items) {
    const group = groups.get(item.projectId);
    if (group) group.items.push(item);
    else {
      groups.set(item.projectId, {
        projectId: item.projectId,
        projectName: item.projectName,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

/** `8 waiting · 4 projects · Oldest 2 h`; null when nothing waits. */
export function inboxMeta(
  items: readonly InboxItemView[],
  now = Date.now(),
): string | null {
  const oldest = items[0];
  if (!oldest) return null;
  const projects = new Set(items.map((item) => item.projectId)).size;
  return [
    `${items.length} waiting`,
    projects === 1 ? '1 project' : `${projects} projects`,
    `Oldest ${formatAge(oldest.since, now)}`,
  ].join(' · ');
}

/** The empty kind filter's title and the rest that still waits. */
export function emptyKindText(
  kind: InboxItemKind,
  others: number,
): { title: string; description: string } {
  return {
    title: EMPTY_KIND_TITLE[kind],
    description:
      others === 1
        ? '1 other thing waits on you.'
        : `${others} other things wait on you.`,
  };
}

/** The rail's count on Inbox; nothing at zero. */
export const inboxBadge = (waiting: number): RailBadge | undefined =>
  waiting > 0
    ? {
        count: waiting,
        tone: 'warn',
        label: `${waiting} waiting in the Inbox`,
      }
    : undefined;

/** The bell's link: `Open Inbox (3)`, the count left out at zero. */
export const inboxLinkText = (waiting: number): string =>
  waiting > 0 ? `Open Inbox (${waiting})` : 'Open Inbox';

/** Why a card needs a person, as its row says it. */
export function failedReasonText(item: InboxFailedItem): string {
  switch (item.reason) {
    case 'collect_failed':
      return 'Its work could not be pushed';
    case 'auto_run_failed':
      return 'An automatic run was refused';
    case 'round_failed':
      return NEEDS_PERSON_ROUND_TEXT.round_failed;
    case 'needs_person':
      return needsPersonText({ ...item.card, needsPersonReason: null });
    default:
      return needsPersonText({ ...item.card, needsPersonReason: item.reason });
  }
}

/** Where an item opens in full: the card, its design, or the project's settings. */
export function inboxItemHref(item: InboxItemView): string {
  switch (item.kind) {
    case 'design':
      return cardDesignHref(item.projectId, item.card.number);
    case 'question':
    case 'merge':
    case 'failed':
      return boardCardHref(item.projectId, item.card.number);
    case 'permission':
      return approvalsHref(item.projectId);
    case 'setup':
      return `/projects/${encodeURIComponent(item.projectId)}/settings`;
  }
}

/** One item's title: the card's, the request's summary, or the blocker. */
export function inboxItemTitle(item: InboxItemView): string {
  switch (item.kind) {
    case 'permission':
      return item.request.summary;
    case 'setup':
      return SETUP_TITLE[item.blocker.code];
    default:
      return item.card.title;
  }
}

/** The blocker as a row's title; its sentence and fix come from `readinessCopy`. */
const SETUP_TITLE: Record<
  Extract<InboxItemView, { kind: 'setup' }>['blocker']['code'],
  string
> = {
  no_profile: 'No runtime profile',
  runner_offline: 'Runner offline',
  runner_outdated: 'Runner out of date',
  no_spec_dir: 'No spec folder',
  no_docs_clone: 'No docs clone',
  content_off: 'Session content is off',
};

/** How many items Overview's preview shows. */
export const INBOX_PREVIEW_SHOWN = 5;

/** Overview's preview: the oldest few, and how many more wait. */
export function inboxPreview(
  view: Pick<InboxView, 'items'>,
  shown = INBOX_PREVIEW_SHOWN,
): { items: InboxItemView[]; more: number } {
  return {
    items: view.items.slice(0, shown),
    more: Math.max(0, view.items.length - shown),
  };
}

/** A card item's label (`C-12`) or the kind's tag for the rest. */
export const inboxItemLabel = (item: InboxItemView): string =>
  'card' in item ? item.card.label : INBOX_ITEM_TAG[item.kind];
