'use client';

import {
  type ActivityPage,
  BOARD_CHANGED_EVENT,
  FLEET_LIVE_EVENT,
  type FleetsView,
  type FleetView,
  type ProjectSummary,
  RUN_UPDATED_LIVE_EVENT,
  SESSIONS_CHANGED_LIVE_EVENT,
  type UsageBreakdownResponse,
  type UsageSummaryResponse,
  type UsageTimeseriesResponse,
} from '@nautelle/shared';
import { api } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live/use-live-refresh';
import {
  lastSevenDays,
  nextHour,
  startOfToday,
} from '../../lib/overview/dashboard';
import { type Section, useSection } from '../../lib/section/use-section';
import { browserZone } from '../../lib/usage/format';

/** What moves the project facts: fleets. */
const FACTS_EVENTS = [FLEET_LIVE_EVENT];
/** Today's cost moves when a session's usage lands. */
const COST_EVENTS = [SESSIONS_CHANGED_LIVE_EVENT];
/** Merges and recent activity follow the Board and the runs. */
const ACTIVITY_EVENTS = [BOARD_CHANGED_EVENT, RUN_UPDATED_LIVE_EVENT];
/** Merges in one day across every project; more than this is not a glance. */
const MERGED_LIMIT = 200;
/** Recent activity shows this many events before "All activity". */
const RECENT_LIMIT = 8;
/** Projects in the cost breakdown; the API caps a breakdown at 200 rows. */
const COST_PROJECTS_LIMIT = 200;

export interface ProjectFacts {
  fleets: Map<string, FleetView>;
  /** Projects where its fleet did not answer — never shown as zero. */
  failed: ProjectSummary[];
}

/**
 * Every project's fleet, from one `GET /fleet`. What waits on the person is
 * the Inbox's (C-390), not this. A project the call has no fleet for, or the
 * call failing, puts the project in `failed` and the page says so beside the
 * figures.
 */
async function loadProjectFacts(
  projects: ProjectSummary[],
): Promise<ProjectFacts> {
  const facts: ProjectFacts = { fleets: new Map(), failed: [] };
  const byProject = await api<FleetsView>('/fleet').then(
    ({ items }) => new Map(items.map((f) => [f.projectId, f])),
    () => undefined,
  );
  for (const project of projects) {
    const fleet = byProject?.get(project.id);
    if (fleet) facts.fleets.set(project.id, fleet);
    else facts.failed.push(project);
  }
  return facts;
}

export interface Dashboard {
  facts: Section<ProjectFacts>;
  costToday: Section<UsageSummaryResponse>;
  /** Today's cost per project, from the usage breakdown. */
  costByProject: Section<UsageBreakdownResponse>;
  merged: Section<ActivityPage>;
  /** The newest events across every project, unfiltered, as `/activity` opens. */
  recent: Section<ActivityPage>;
  /** Cost per local day for the last 7 days, as `/usage` cuts it. */
  spend: Section<UsageTimeseriesResponse>;
}

/** The dashboard's sections, each loading and failing on its own. */
export function useDashboard(projects: ProjectSummary[]): Dashboard {
  // The project list is refetched as a new array; load again only when it changes.
  const projectIds = projects.map((p) => p.id);
  const ids = projectIds.join(',');
  const facts = useSection(() => loadProjectFacts(projects), [ids]);
  const costToday = useSection(() => {
    const query = new URLSearchParams({
      from: startOfToday(),
      to: nextHour(),
    });
    return api<UsageSummaryResponse>(`/usage/summary?${query}`);
  }, []);
  const costByProject = useSection(() => {
    const query = new URLSearchParams({
      from: startOfToday(),
      to: nextHour(),
      dimension: 'project',
      limit: String(COST_PROJECTS_LIMIT),
    });
    return api<UsageBreakdownResponse>(`/usage/breakdown?${query}`);
  }, []);
  const merged = useSection(() => {
    const query = new URLSearchParams({
      type: 'pr.merged',
      from: startOfToday(),
      limit: String(MERGED_LIMIT),
    });
    return api<ActivityPage>(`/activity?${query}`);
  }, []);
  const recent = useSection(
    () => api<ActivityPage>(`/activity?limit=${RECENT_LIMIT}`),
    [],
  );
  const spend = useSection(() => {
    const query = new URLSearchParams({
      ...lastSevenDays(),
      interval: 'day',
      groupBy: 'none',
      tz: browserZone(),
    });
    return api<UsageTimeseriesResponse>(`/usage/timeseries?${query}`);
  }, []);

  // Live events replace the old 30 s poll; the socket being down falls back to
  // a slow one. The retry callbacks are stable.
  useLiveRefresh(projectIds, FACTS_EVENTS, facts.retry);
  useLiveRefresh(projectIds, COST_EVENTS, () => {
    costToday.retry();
    costByProject.retry();
    spend.retry();
  });
  useLiveRefresh(projectIds, ACTIVITY_EVENTS, () => {
    merged.retry();
    recent.retry();
  });

  return { facts, costToday, costByProject, merged, recent, spend };
}
