'use client';

import { FLEET_LIVE_EVENT, type ProjectDetail } from '@nautelle/shared';
import { api } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live/use-live-refresh';
import { useSection } from '../../../../lib/section/use-section';

/** Fleet events come in bursts; the detail needs no more than this often. */
const EVENT_REFRESH_MS = 2_000;
/**
 * A runner that drops goes quiet: presence is derived from time, so no event
 * reports it. This slow look is what lets the banner appear on an idle page.
 */
const PRESENCE_REFRESH_MS = 120_000;

/**
 * The project the page is about, with the runner that serves it. The data
 * stays on a failed refresh (rule R2), so a banner never flickers away. A
 * runner that comes back shows through its fleet events, without a reload.
 */
export function useProjectDetail(projectId: string) {
  const section = useSection(
    () => api<ProjectDetail>(`/projects/${projectId}`),
    [projectId],
  );
  useLiveRefresh([projectId], [FLEET_LIVE_EVENT], section.retry, {
    delayMs: EVENT_REFRESH_MS,
    safetyMs: PRESENCE_REFRESH_MS,
  });
  return section;
}
