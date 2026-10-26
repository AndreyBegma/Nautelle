import type {
  ActivityItem,
  FleetView,
  OrchestratorStatus,
  ProjectSummary,
  SlotStatus,
  SlotSummary,
  UsageTimeseriesResponse,
} from '@nautelle/shared';
import { ORCHESTRATOR_STATUS_LABEL } from '../fleet/format';
import { costOrBlank } from '../usage/format';

/**
 * The Overview dashboard (issue #159) is composed from the per-project routes
 * the app already has — there is no aggregate endpoint. These helpers turn
 * those answers into the figures and lists the page shows, so the page only
 * fetches and renders.
 */

/** A slot whose session is alive: it is working, waiting, or out of quota. */
const ALIVE: ReadonlySet<SlotStatus> = new Set([
  'running',
  'idle',
  'prompt',
  'quota',
]);

export const isAlive = (slot: Pick<SlotSummary, 'status'>): boolean =>
  ALIVE.has(slot.status);

/** Local midnight today, as an instant: "today" is the viewer's day. */
export function startOfToday(now: Date = new Date()): string {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.toISOString();
}

/** The start of the hour after `now` — the usage range's exclusive end. */
export function nextHour(now: Date = new Date()): string {
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  hour.setHours(hour.getHours() + 1);
  return hour.toISOString();
}

/** The six local midnights before today, and today: a 7-day range. */
export function lastSevenDays(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  return { from: from.toISOString(), to: nextHour(now) };
}

export function runningSlots(fleets: Iterable<FleetView>): number {
  let count = 0;
  for (const fleet of fleets) {
    for (const slot of fleet.slots) if (isAlive(slot)) count += 1;
  }
  return count;
}

export interface LiveSession {
  project: ProjectSummary;
  slot: SlotSummary;
}

/**
 * Every alive slot of every project whose fleet answered — the ones the
 * Running slots tile counts — longest running first. A project without a
 * fleet contributes nothing here; the block names it instead.
 */
export function liveSessions(
  projects: readonly ProjectSummary[],
  fleets: ReadonlyMap<string, FleetView>,
): LiveSession[] {
  const sessions: LiveSession[] = [];
  for (const project of projects) {
    for (const slot of fleets.get(project.id)?.slots ?? []) {
      if (isAlive(slot)) sessions.push({ project, slot });
    }
  }
  return sessions.sort(
    (a, b) => Date.parse(a.slot.startedAt) - Date.parse(b.slot.startedAt),
  );
}

/**
 * Where each Overview figure is explained (#213). Running slots go to
 * Sessions: Fleet is per project, and Sessions lists every live one.
 */
export const OVERVIEW_TILE_HREF = {
  running: '/sessions',
  cost: '/usage?range=today',
} as const;

/**
 * Activity filtered to today's merges, the tile's figure: `?type=pr.merged`
 * and `?from=` the viewer's local day, as Activity's filter bar reads them.
 */
export function mergedTodayHref(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `/activity?type=pr.merged&from=${day}`;
}

/**
 * Pull requests merged today. An event can reach the feed twice (the plugin
 * and the scraper both see a merge), so a PR counts once per project.
 */
export function mergedPullRequests(items: ActivityItem[]): number {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.type !== 'pr.merged') continue;
    seen.add(`${item.projectId ?? ''}#${item.prNumber ?? item.id}`);
  }
  return seen.size;
}

/** "Slot i42 · #42" — the slot's name and, when it has one, its issue. */
export function slotTitle(slot: Pick<SlotSummary, 'name' | 'issue'>): string {
  return slot.issue === null
    ? `Slot ${slot.name}`
    : `Slot ${slot.name} · #${slot.issue}`;
}

/** Daily cost per project, keyed by project id, from a `groupBy=project` series. */
export function costByProject(
  response: Pick<UsageTimeseriesResponse, 'series'>,
): Map<string, number[]> {
  const byProject = new Map<string, number[]>();
  for (const series of response.series) {
    if (!series.key) continue;
    byProject.set(
      series.key,
      series.points.map((p) => {
        const cost = Number(p.costUsd);
        return Number.isFinite(cost) ? cost : 0;
      }),
    );
  }
  return byProject;
}

/** The Overview's spend: one cost per day, oldest first, today last. */
export interface SpendDays {
  values: number[];
  /** Today's cost as `/usage` writes it; blank when today has no priced request. */
  today: string;
}

/**
 * The 7 daily costs of an ungrouped `interval=day` series (zero-filled by the
 * API). A day whose requests are all unpriced is not `$0`: its figure is
 * blank, as on `/usage`.
 */
export function spendDays(
  response: Pick<UsageTimeseriesResponse, 'series'>,
): SpendDays {
  const points = (response.series[0]?.points ?? []).slice(-7);
  const values = points.map((p) => {
    const cost = Number(p.costUsd);
    return Number.isFinite(cost) ? cost : 0;
  });
  const last = points.at(-1);
  return {
    values,
    today: last
      ? costOrBlank(last.costUsd, last.requests, last.unpricedRequests)
      : '',
  };
}

/** "Orchestrator: Not running" — the Fleet's one vocabulary, named (#213). */
export const orchestratorLabel = (status: OrchestratorStatus): string =>
  `Orchestrator: ${ORCHESTRATOR_STATUS_LABEL[status]}`;

/**
 * "Round Oct 13, 14:05 · up to 5 slots" — a round's start and ceiling. Not
 * the board's `occupied`: a board that stopped parsing keeps its last figure,
 * and the card beside it counts the live slots (#213).
 */
export function roundLabel(
  round: FleetView['latestRound'],
  formatDay: (iso: string) => string,
): string | null {
  if (!round) return null;
  const hhmm = /^\d{4}$/.test(round.label)
    ? `${round.label.slice(0, 2)}:${round.label.slice(2)}`
    : round.label;
  const day = formatDay(`${round.date}T00:00:00`);
  return `Round ${day}, ${hhmm} · up to ${round.max} slots`;
}
