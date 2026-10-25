'use client';

import {
  type ActivityPage,
  APPROVALS_LIVE_EVENT,
  type ApprovalsView,
  BOARD_CHANGED_EVENT,
  FLEET_LIVE_EVENT,
  type FleetsView,
  type FleetView,
  type OrchestratorSettingsView,
  type ProjectSummary,
  RUN_UPDATED_LIVE_EVENT,
  type RunPage,
  type RunSummary,
  SESSIONS_CHANGED_LIVE_EVENT,
  type TerminalSetupView,
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

/** What moves the project facts: fleets, approvals and failed runs. */
const FACTS_EVENTS = [
  FLEET_LIVE_EVENT,
  APPROVALS_LIVE_EVENT,
  RUN_UPDATED_LIVE_EVENT,
  BOARD_CHANGED_EVENT,
];
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
/** The newest failed runs per project; "Needs you" shows the last 24 h of them. */
const FAILED_RUNS_LIMIT = 20;

export interface ProjectFacts {
  fleets: Map<string, FleetView>;
  approvals: Map<string, ApprovalsView>;
  /** Each project's latest failed runs; "Needs you" keeps the last 24 h. */
  failedRuns: Map<string, RunSummary[]>;
  /** Projects whose orchestrator has no profile, its own or the default. */
  missingProfile: Set<string>;
  /**
   * Each operator-or-up project's "Terminal → Board" checklist (#281). A
   * project whose checklist did not answer is absent — an API that predates the
   * endpoint must not read as a problem, so it is not in `failed`.
   */
  terminalSetup: Map<string, TerminalSetupView>;
  /** Projects where any of these did not answer — never shown as zero. */
  failed: ProjectSummary[];
}

/**
 * Every project's fleet, approvals, failed runs and orchestrator settings. The
 * fleets come from one `GET /fleet`; the rest is still per project. One project
 * failing does not fail the rest: its id goes in `failed` and the page says so
 * beside the figures.
 */
async function loadProjectFacts(
  projects: ProjectSummary[],
): Promise<ProjectFacts> {
  const fleetsCall = api<FleetsView>('/fleet').then(
    ({ items }) => new Map(items.map((f) => [f.projectId, f])),
  );
  // A rejected call is handled per project below; keep it from going unhandled.
  fleetsCall.catch(() => undefined);
  const results = await Promise.all(
    projects.map(async (project) => {
      const base = `/projects/${project.id}`;
      const [fleet, approvals, runs, settings, setup] =
        await Promise.allSettled([
          fleetsCall.then((byProject) => {
            const view = byProject.get(project.id);
            if (!view) throw new Error('no fleet');
            return view;
          }),
          api<ApprovalsView>(`${base}/approvals`),
          api<RunPage>(`${base}/runs?status=failed&limit=${FAILED_RUNS_LIMIT}`),
          api<OrchestratorSettingsView>(`${base}/orchestrator/settings`),
          project.role === 'viewer'
            ? Promise.reject(new Error('viewer'))
            : api<TerminalSetupView>(`${base}/terminal-setup`),
        ]);
      return { project, fleet, approvals, runs, settings, setup };
    }),
  );
  const facts: ProjectFacts = {
    fleets: new Map(),
    approvals: new Map(),
    failedRuns: new Map(),
    missingProfile: new Set(),
    terminalSetup: new Map(),
    failed: [],
  };
  for (const { project, fleet, approvals, runs, settings, setup } of results) {
    if (setup.status === 'fulfilled') {
      facts.terminalSetup.set(project.id, setup.value);
    }
    if (fleet.status === 'fulfilled') facts.fleets.set(project.id, fleet.value);
    if (approvals.status === 'fulfilled') {
      facts.approvals.set(project.id, approvals.value);
    }
    if (runs.status === 'fulfilled') {
      facts.failedRuns.set(project.id, runs.value.items);
    }
    if (
      settings.status === 'fulfilled' &&
      settings.value.effectiveProfile === null
    ) {
      facts.missingProfile.add(project.id);
    }
    if (
      fleet.status === 'rejected' ||
      approvals.status === 'rejected' ||
      runs.status === 'rejected' ||
      settings.status === 'rejected'
    ) {
      facts.failed.push(project);
    }
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
