'use client';

import {
  FLEET_LIVE_EVENT,
  type FleetsView,
  type FleetView,
} from '@nautelle/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/live/use-live-refresh';

/** `undefined` while loading, `null` when the request failed. */
export type Fact<T> = T | null | undefined;

export interface ProjectFacts {
  fleets: Readonly<Record<string, Fact<FleetView>>>;
}

/**
 * What the Projects list shows beside each project: its fleet (orchestrator
 * and slots), from one `GET /fleet` for every project the user can see. A
 * failed request leaves the cards on a dash; it never blanks the list, and a
 * failed refresh keeps the figures already shown. The fleets reload when a
 * project's fleet changes.
 */
export function useProjectFacts(projectIds: readonly string[]): ProjectFacts {
  const [fleets, setFleets] = useState<Record<string, Fact<FleetView>>>({});
  const [version, setVersion] = useState(0);
  const key = projectIds.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `projectIds`.
  useEffect(() => {
    if (projectIds.length === 0) return;
    let cancelled = false;
    api<FleetsView>('/fleet')
      .then(({ items }) => {
        if (cancelled) return;
        const byProject = new Map(items.map((f) => [f.projectId, f]));
        setFleets(
          Object.fromEntries(
            projectIds.map((id) => [id, byProject.get(id) ?? null]),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        // Keep what a refresh already showed; a first load leaves the dashes.
        setFleets((prev) =>
          Object.fromEntries(projectIds.map((id) => [id, prev[id] ?? null])),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  useLiveRefresh(
    projectIds,
    [FLEET_LIVE_EVENT],
    useCallback(() => setVersion((n) => n + 1), []),
  );

  return { fleets };
}
