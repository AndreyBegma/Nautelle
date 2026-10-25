import type { CommandPaletteGroup } from '@andrewbehma/glass-ui/command-palette';
import type {
  PlanSummary,
  ProjectSummary,
  Role,
  RunSummary,
  SessionSummary,
  WorkCardItem,
} from '@nautelle/shared';
import { BOARD_ASK_QUESTION_MAX, parseWorkSearch } from '@nautelle/shared';
import {
  Check,
  FilePlus2,
  FolderGit2,
  Inbox,
  Lightbulb,
  LogOut,
  type LucideIcon,
  MessagesSquare,
  Palette,
  Play,
  Sparkles,
  Square,
  SquareTerminal,
  User,
} from 'lucide-react';
import { COLUMN_TITLE } from '../../lib/board/format';
import {
  boardCardAcceptHref,
  boardCardStopHref,
  boardNewWorkHref,
  boardQuickCardHref,
} from '../../lib/board/href';
import { runHref } from '../../lib/history/format';
import { planHref } from '../../lib/planner/href';
import { planLabel, runLabel, sessionLabel } from './crumbs';
import { type VisibleSection, visibleNav } from './nav';

/** What the palette opened with: the newest sessions and the current project's runs. */
export interface RecentEntities {
  sessions: readonly SessionSummary[];
  runs: readonly RunSummary[];
}

export interface PaletteInput {
  query: string;
  role: Role;
  /** The rail's sections at the current path. */
  sections: readonly VisibleSection[];
  projects: readonly ProjectSummary[];
  projectId: string | null;
  recent: RecentEntities;
  /** The current project's plans; none outside a project. */
  plans: readonly PlanSummary[];
  /** The theme the "Switch theme" action reads as its hint. */
  themeLabel: string;
  /** C-393: the cards the lookup found for the query, across projects. */
  cards?: readonly WorkCardItem[];
}

/** C-393: a palette row that runs a card from where the person is. */
export const CARD_RUN_PREFIX = 'card:run:';

/** C-393: the Inbox, until it has a page of its own. */
export const INBOX_HREF = '/work?status=inbox';

/** Cards listed for a lookup. */
const CARDS_MAX = 6;

/** New card rows listed when no project is open: one per project, this many. */
const NEW_CARD_PROJECTS_MAX = 5;

/** `C-12` or `#41`: a query that names one card, not a title to search. */
export function isCardReference(query: string): boolean {
  const search = parseWorkSearch(query);
  return search.cardNumber !== null || search.issueNumber !== null;
}

/** C-393: whether the lookup should run for this query. */
export const lookupWanted = (query: string): boolean =>
  query.trim().length >= 2 || isCardReference(query);

/** #660: the palette row that asks the Board the query, as a question. */
export const ASK_PREFIX = 'ask:';

/**
 * #660 Ask the Board: any query of three characters or more can be asked as
 * a question. Its row comes last, so Enter on a query that matches a page
 * still opens the page.
 */
export function askItem(query: string): Item | null {
  const question = query.trim();
  if (question.length < 3 || question.length > BOARD_ASK_QUESTION_MAX) {
    return null;
  }
  return {
    id: `${ASK_PREFIX}${question}`,
    label: `Ask the Board: “${question}”`,
    hint: 'AI',
    icon: Sparkles,
  };
}

/** Project pages listed for a query: every project times eight pages adds up. */
const PROJECT_PAGES_MAX = 12;

/** Plans listed: the newest, or the newest that match the query. */
const PLANS_MAX = 5;

/** Every word of the query appears in the text, in any order. */
function matcher(query: string): (text: string) => boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (text) => {
    const haystack = text.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
}

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
}

function group(id: string, title: string, items: Item[]) {
  return items.length > 0 ? [{ id, title, items }] : [];
}

/** The project's own pages, labelled "Nautelle › Fleet". */
function projectPages(project: ProjectSummary, role: Role): Item[] {
  const section = visibleNav(role, `/projects/${project.id}`).find(
    (candidate) => candidate.id === 'project',
  );
  return (section?.entries ?? []).map((entry) => ({
    id: `go:${entry.resolvedHref}`,
    label: `${project.displayName} › ${entry.label}`,
    icon: entry.icon,
  }));
}

/**
 * C-393: what the palette offers for one found card. Run, Accept and Stop need
 * an operator of the card's project and a card the Board owns; they apply to
 * the column the card is in, and the API still refuses what does not fit.
 * Open is always there.
 */
function cardActionItems(
  card: WorkCardItem,
  projects: readonly ProjectSummary[],
): Item[] {
  const role = projects.find((project) => project.id === card.projectId)?.role;
  const operator = role !== undefined && role !== 'viewer';
  const own = operator && card.source === 'card';
  const items: Item[] = [];
  if (own && (card.column === 'todo' || card.column === 'finished')) {
    items.push({
      id: `${CARD_RUN_PREFIX}${card.projectId}:${card.number}`,
      label: `Run ${card.label}`,
      hint: card.title,
      icon: Play,
    });
  }
  if (own && card.column === 'finished') {
    items.push({
      id: `go:${boardCardAcceptHref(card.projectId, card.number)}`,
      label: `Accept ${card.label}`,
      hint: card.title,
      icon: Check,
    });
  }
  if (own && card.column === 'in_progress') {
    items.push({
      id: `go:${boardCardStopHref(card.projectId, card.number)}`,
      label: `Stop ${card.label}`,
      hint: card.title,
      icon: Square,
    });
  }
  items.push({
    id: `go:${card.href}`,
    label: `Open ${card.label}`,
    hint: card.title,
    icon: SquareTerminal,
  });
  return items;
}

/**
 * The command palette's results (#159). Group titles are unique and no row
 * repeats its group's title as a hint. With no query, the project pages are
 * the current project's; with one, every project's that match.
 */
export function paletteGroups(input: PaletteInput): CommandPaletteGroup[] {
  const matches = matcher(input.query);
  const searching = input.query.trim() !== '';

  // The Admin pages share names with project pages (Settings, Schedules):
  // their own group tells them apart, once, instead of a hint on every row.
  const sectionPages = (id: VisibleSection['id']): Item[] =>
    input.sections
      .filter((section) => section.id === id)
      .flatMap((section) =>
        section.entries
          .filter((entry) => matches(`${section.title} ${entry.label}`))
          .map((entry) => ({
            id: `go:${entry.resolvedHref}`,
            label: entry.label,
            icon: entry.icon,
          })),
      );
  const pages = sectionPages('workspace');
  if (matches('inbox')) {
    pages.unshift({ id: `go:${INBOX_HREF}`, label: 'Inbox', icon: Inbox });
  }
  const admin = sectionPages('admin');
  if (matches('account')) {
    pages.push({ id: 'go:/account', label: 'Account', icon: User });
  }

  const current = input.projects.find(
    (project) => project.id === input.projectId,
  );
  const pagesOf = searching
    ? input.projects
    : current
      ? [current]
      : ([] as ProjectSummary[]);
  const subPages = pagesOf
    .flatMap((project) => projectPages(project, input.role))
    .filter((item) => matches(item.label))
    .slice(0, PROJECT_PAGES_MAX);

  const projects: Item[] = input.projects
    .filter((project) =>
      matches(`project ${project.displayName} ${project.repo}`),
    )
    .map((project) => ({
      id: `go:/projects/${project.id}`,
      label: project.displayName,
      hint: project.repo,
      icon: FolderGit2,
    }));

  const projectName = new Map(
    input.projects.map((project) => [project.id, project.displayName]),
  );
  const planTitle = new Map(input.plans.map((plan) => [plan.id, plan]));
  // A planner run is a turn of a plan: it shows as the plan it serves, once
  // however many turns it took (#213).
  const runItem = (run: RunSummary): Item => {
    const where = projectName.get(run.projectId);
    if (run.planId) {
      const plan = planTitle.get(run.planId);
      return {
        id: `go:${planHref(run.projectId, run.planId)}`,
        label: plan ? planLabel(plan) : runLabel(run),
        hint: ['Plan', where].filter(Boolean).join(' · '),
        icon: Lightbulb,
      };
    }
    return {
      id: `go:${runHref(run.projectId, run.id)}`,
      label: runLabel(run),
      hint: ['Run', where].filter(Boolean).join(' · '),
      icon: Play,
    };
  };
  const seen = new Set<string>();
  const recent: Item[] = [
    ...input.recent.sessions.map((session) => ({
      id: `go:/sessions/${session.id}`,
      label: sessionLabel(session),
      hint: ['Session', session.projectName].filter(Boolean).join(' · '),
      icon: SquareTerminal,
    })),
    ...input.recent.runs.map(runItem),
  ]
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .filter((item) => matches(`${item.label} ${item.hint}`));

  const plans: Item[] = [...input.plans]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((plan) => ({
      id: `go:${planHref(plan.projectId, plan.id)}`,
      label: planLabel(plan),
      icon: Lightbulb,
    }))
    .filter((item) => matches(`plan ${item.label}`))
    .slice(0, PLANS_MAX);

  // C-393: New card and New work for the open project; with none open, one row
  // per project the caller can operate.
  const operable = (project: ProjectSummary) => project.role !== 'viewer';
  const createIn = current
    ? operable(current)
      ? [current]
      : []
    : input.projects.filter(operable).slice(0, NEW_CARD_PROJECTS_MAX);
  const several = !current && createIn.length > 1;
  const create: Item[] = createIn
    .flatMap((project) => {
      const where = several ? ` · ${project.displayName}` : '';
      return [
        {
          id: `go:${boardQuickCardHref(project.id)}`,
          label: `New card${where}`,
          hint: 'Quick',
          icon: FilePlus2,
        },
        {
          id: `go:${boardNewWorkHref(project.id)}`,
          label: `New work${where}`,
          hint: 'Interview',
          icon: MessagesSquare,
        },
      ];
    })
    .filter((item) => matches(item.label));

  const reference = isCardReference(input.query);
  const found = (input.cards ?? []).slice(0, CARDS_MAX);
  const cards: Item[] = found.map((card) => ({
    id: `go:${card.href}`,
    label: `${card.label} · ${card.title}`,
    hint: [card.projectName, COLUMN_TITLE[card.column]].join(' · '),
    icon: Square,
  }));
  // The card the query names — a reference, or the only one found — gets its
  // actions, ahead of the lookup.
  const target = found.length === 1 || reference ? found[0] : undefined;
  const cardActions: Item[] = target
    ? cardActionItems(target, input.projects)
    : [];

  const actions: Item[] = [
    {
      id: 'action:theme',
      label: 'Switch theme',
      hint: input.themeLabel,
      icon: Palette,
    },
    { id: 'action:logout', label: 'Log out', icon: LogOut },
  ].filter((item) => matches(item.label));

  return [
    ...group('create', 'Create', create),
    ...group('card-actions', target?.label ?? 'Card', cardActions),
    ...group('cards', 'Cards', cards),
    ...group('pages', 'Go to', pages),
    ...group('project-pages', 'Project pages', subPages),
    ...group('projects', 'Projects', projects),
    ...group('plans', 'Plans', plans),
    ...group('recent', 'Recent', recent),
    ...group('admin', 'Admin', admin),
    ...group('actions', 'Actions', actions),
    ...group(
      'ask',
      'Ask the Board',
      [askItem(input.query)].filter((item): item is Item => item !== null),
    ),
  ];
}
