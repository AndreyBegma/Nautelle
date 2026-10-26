'use client';

import { BOARD_CHANGED_EVENT } from '@nautelle/shared';
import { useEffect, useRef } from 'react';
import { useLivePaused } from '../../components/shell/live-status';
import { getLiveClient } from './client';
import { LIVE_PROJECT_BUDGET } from './plan';

/** A burst of events folds into one reload this long after the first. */
export const LIVE_REFRESH_DELAY_MS = 300;
/** While the socket is down (or a topic is not followed), look this often. */
export const LIVE_FALLBACK_POLL_MS = 30_000;

/** The project topics one page follows, and whether that is all of them. */
export function followedProjectTopics(projectIds: readonly string[]): {
  followed: string[];
  covered: boolean;
} {
  const followed = projectIds.slice(0, LIVE_PROJECT_BUDGET);
  return { followed, covered: followed.length === projectIds.length };
}

/**
 * Folds a burst into one call: the first `poke` starts the window, the ones
 * inside it add nothing. Unlike a debounce, a steady stream still fires.
 */
export function createBurstFolder(
  fire: () => void,
  delayMs: number,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): { poke(): void; cancel(): void } {
  let pending: unknown;
  let waiting = false;
  return {
    poke() {
      if (waiting) return;
      waiting = true;
      pending = timers.set(() => {
        waiting = false;
        fire();
      }, delayMs);
    },
    cancel() {
      if (waiting) timers.clear(pending);
      waiting = false;
    },
  };
}

export interface LiveRefreshOptions {
  /** Folds a burst of events into one reload; default `LIVE_REFRESH_DELAY_MS`. */
  delayMs?: number;
  /** Fallback poll while the socket is down; default `LIVE_FALLBACK_POLL_MS`. */
  fallbackMs?: number;
  /**
   * A poll that runs even while the socket is up, for a fact no event reports
   * (a runner's presence is derived from time, so it never pushes).
   */
  safetyMs?: number;
  /** Topics followed beside the projects' (`admin`, for unassigned sessions). */
  extraTopics?: readonly string[];
}

/**
 * Calls `reload` when one of `events` arrives on any of the projects' live
 * topics (the ones the Board follows), for pages that span projects. A burst is
 * folded into one reload, the first event starting the window, so a busy round
 * cannot starve the refresh. The client replays `board.changed` after a
 * reconnect, so a gap refreshes too.
 *
 * While the socket has been down for a few seconds (the reconnect banner's
 * rule), or the projects outnumber the subscriptions one socket may hold, it
 * polls slowly instead.
 */
export function useLiveRefresh(
  projectIds: readonly string[],
  events: readonly string[],
  reload: () => void,
  options: LiveRefreshOptions = {},
): void {
  const {
    delayMs = LIVE_REFRESH_DELAY_MS,
    fallbackMs = LIVE_FALLBACK_POLL_MS,
    safetyMs,
    extraTopics = [],
  } = options;
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  const { paused } = useLivePaused();

  const { followed, covered } = followedProjectTopics(projectIds);
  const topics = [...followed.map((id) => `project:${id}`), ...extraTopics];
  const topicsKey = topics.join(',');
  // The resync event is the client's "you missed something" signal.
  const eventsKey = [...new Set([BOARD_CHANGED_EVENT, ...events])].join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: the keys stand for the arrays.
  useEffect(() => {
    if (topics.length === 0) return;
    const wanted = new Set(eventsKey.split(','));
    const folder = createBurstFolder(() => latest.current(), delayMs);
    const unsubscribe = topics.map((topic) =>
      getLiveClient().subscribe(topic, (message) => {
        if (wanted.has(message.event)) folder.poke();
      }),
    );
    return () => {
      folder.cancel();
      for (const stop of unsubscribe) stop();
    };
  }, [topicsKey, eventsKey, delayMs]);

  const pollMs = paused || !covered ? fallbackMs : safetyMs;
  useEffect(() => {
    if (pollMs === undefined) return;
    const timer = setInterval(() => latest.current(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);
}
