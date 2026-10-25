'use client';

import type {
  PlanListView,
  PlanSummary,
  ProjectSummary,
  RunPage,
  SessionListResponse,
  WorkCardItem,
  WorkPage,
} from '@nautelle/shared';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { EMPTY_WORK_FILTERS, workQuery } from '../../lib/work/format';
import { lookupWanted, type RecentEntities } from './palette';

/** Rows the palette's Recent group lists per kind. */
const RECENT_LIMIT = 5;

const NO_RECENT: RecentEntities = { sessions: [], runs: [] };

/** The projects the caller may see, fetched once for the rail, trail and palette. */
export function useProjects(): ProjectSummary[] {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    api<ProjectSummary[]>('/projects')
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setProjects(list);
      })
      .catch(() => {
        // No switcher and no project names; the Projects page still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return projects;
}

/** The newest sessions and the current project's runs, read when the palette opens. */
export function useRecent(
  open: boolean,
  projectId: string | null,
): RecentEntities {
  const [recent, setRecent] = useState<RecentEntities>(NO_RECENT);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const sessions = api<SessionListResponse>(
      `/sessions?limit=${RECENT_LIMIT}`,
    ).then(
      (page) => page.items,
      () => [],
    );
    const runs = projectId
      ? api<RunPage>(`/projects/${projectId}/runs?limit=${RECENT_LIMIT}`).then(
          (page) => page.items,
          () => [],
        )
      : Promise.resolve([]);
    void Promise.all([sessions, runs]).then(([sessionItems, runItems]) => {
      if (!cancelled) setRecent({ sessions: sessionItems, runs: runItems });
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);
  return recent;
}

/** The current project's plans, read when the palette opens (its Plans group). */
export function usePlans(
  open: boolean,
  projectId: string | null,
): PlanSummary[] {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  useEffect(() => {
    if (!open) return;
    if (!projectId) {
      setPlans([]);
      return;
    }
    let cancelled = false;
    api<PlanListView>(`/projects/${projectId}/plans`)
      .then((view) => {
        if (!cancelled) setPlans(view.items);
      })
      .catch(() => {
        // No Plans group; the Planner page says what went wrong.
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);
  return plans;
}

/** Wait for the typing to pause before the lookup asks the API. */
const LOOKUP_DEBOUNCE_MS = 200;

/**
 * C-393: the cards matching what is typed in the palette — `C-12`, `#41` or a
 * title — across the caller's projects (`GET /work?q=`). Plan tasks are left
 * out. `query` says which text the cards answer, so a late answer is never
 * shown under newer text.
 */
export function useCardLookup(
  open: boolean,
  query: string,
): { query: string; cards: WorkCardItem[] } {
  const [found, setFound] = useState<{ query: string; cards: WorkCardItem[] }>({
    query: '',
    cards: [],
  });
  const text = query.trim();
  useEffect(() => {
    if (!open || !lookupWanted(text)) {
      setFound((current) =>
        current.cards.length ? { query: '', cards: [] } : current,
      );
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api<WorkPage>(`/work${workQuery({ ...EMPTY_WORK_FILTERS, q: text })}`)
        .then((page) => {
          if (cancelled) return;
          const cards = page.items.filter(
            (item): item is WorkCardItem => item.source !== 'plan',
          );
          setFound({ query: text, cards });
        })
        .catch(() => {
          // No Cards group; the pages and actions still work.
          if (!cancelled) setFound({ query: text, cards: [] });
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, text]);
  return found;
}
