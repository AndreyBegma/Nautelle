import { MAX_LIVE_SUBSCRIPTIONS } from '@nautelle/shared';

/**
 * Subscriptions left to the shell's own topics and the one page that is open;
 * the rest of the socket's cap (`MAX_LIVE_SUBSCRIPTIONS`) is the page's budget.
 */
export const LIVE_SUBSCRIPTIONS_RESERVED = 10;
/** Projects a workspace page follows live; past it the page polls. */
export const LIVE_PROJECT_BUDGET =
  MAX_LIVE_SUBSCRIPTIONS - LIVE_SUBSCRIPTIONS_RESERVED;
/** How often a workspace page polls when it cannot follow every project. */
export const WORKSPACE_POLL_MS = 60_000;
/** Shown above the list when a workspace page polls instead of following live. */
export const WORKSPACE_POLL_NOTE =
  'Following updates every minute: too many projects to follow live.';

export interface LivePlan {
  topics: (`project:${string}` | 'admin')[];
  /** True when the page cannot follow everything live and must poll instead. */
  poll: boolean;
}

/**
 * Which topics a workspace page (Activity, Sessions) follows. One project
 * (fixed or filtered) is always live, and so is "unassigned", which lives on
 * `admin`. Otherwise the page follows up to `budget` projects, plus `admin`
 * for an admin (project-less items); past the budget it polls and subscribes
 * to nothing, so the shared socket never nears `MAX_LIVE_SUBSCRIPTIONS`.
 */
export function planLive(
  scope: {
    projectId?: string;
    unassigned?: boolean;
    projectIds: readonly string[];
    isAdmin: boolean;
  },
  budget = LIVE_PROJECT_BUDGET,
): LivePlan {
  if (scope.projectId) {
    return { topics: [`project:${scope.projectId}`], poll: false };
  }
  if (scope.unassigned) return { topics: ['admin'], poll: false };
  if (scope.projectIds.length > budget) return { topics: [], poll: true };
  const topics: LivePlan['topics'] = scope.projectIds.map(
    (id) => `project:${id}` as const,
  );
  if (scope.isAdmin) topics.push('admin');
  return { topics, poll: false };
}
