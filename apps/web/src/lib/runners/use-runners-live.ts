'use client';

import { RUNNER_SAFETY_POLL_MS, RUNNER_UPDATED_EVENT } from '@nautelle/shared';
import { useLiveRefresh } from '../live/use-live-refresh';

const RUNNER_EVENTS = [RUNNER_UPDATED_EVENT];
const ADMIN_TOPIC = ['admin'];

/**
 * Calls `reload` when a runner changes (C-479): `runner.updated` on the
 * `admin` topic, a burst folded into one call. A slow safety poll stays for
 * what no event reports — a runner going `stale`, its heartbeat's load.
 */
export function useRunnersLive(reload: () => void, enabled = true): void {
  useLiveRefresh([], RUNNER_EVENTS, reload, {
    extraTopics: ADMIN_TOPIC,
    safetyMs: RUNNER_SAFETY_POLL_MS,
    enabled,
  });
}
