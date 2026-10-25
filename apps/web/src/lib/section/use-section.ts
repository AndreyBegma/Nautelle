'use client';

import {
  type DependencyList,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type SingleFlight, singleFlight } from './single-flight';
import type { SectionState } from './state';

export interface Section<T> extends SectionState<T> {
  /** Loads again; the current data stays on screen meanwhile. */
  retry: () => void;
  /**
   * C-364: loads again without dropping a load in flight — for live events.
   * While one runs, refreshes fold into one more after it, so a steady
   * stream of events still lets each load land.
   */
  refresh: () => void;
  /** Replace the data in place, e.g. after a live update or a mutation. */
  setData: Dispatch<SetStateAction<T | undefined>>;
}

/**
 * One section's data with rule R2: a failed load keeps the previous data and
 * records the error, so the page can show `SectionUnavailable` with `retry`
 * instead of an empty state. `load` runs again whenever `deps` change; a
 * response that arrives after `deps` changed is dropped.
 */
export function useSection<T>(
  load: () => Promise<T>,
  deps: DependencyList,
): Section<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(load);
  const flight = useRef<SingleFlight | undefined>(undefined);
  useEffect(() => {
    latest.current = load;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `deps` is the caller's, `attempt` is retry
  useEffect(() => {
    let current = true;
    const loads = singleFlight(() => {
      setLoading(true);
      return latest
        .current()
        .then((next) => {
          if (!current) return;
          setData(next);
          setError(null);
        })
        .catch((failure: unknown) => {
          if (current) setError(failure);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    });
    flight.current = loads;
    loads.request();
    return () => {
      current = false;
      loads.dispose();
    };
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const refresh = useCallback(() => flight.current?.request(), []);
  return { data, error, loading, retry, refresh, setData };
}
