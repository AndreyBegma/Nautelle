import { RUNNER_STALE_AFTER_MS } from '@nautelle/shared';

/** Timings of the runners module; tests override the provider to run fast. */
export interface RunnerOptions {
  /** A socket silent this long reads `stale` (spec D5). */
  staleAfterMs: number;
  /** How long `POST /admin/runners/:id/ping` waits for the result. */
  pingTimeoutMs: number;
  /** A socket that has not authenticated and sent `hello` by then is closed. */
  helloTimeoutMs: number;
  /** A live socket is pinged this often and ended after two missed pings (#1057 D4). */
  pingIntervalMs: number;
}

export const RUNNER_OPTIONS = Symbol('RUNNER_OPTIONS');

export const defaultRunnerOptions: RunnerOptions = {
  staleAfterMs: RUNNER_STALE_AFTER_MS,
  pingTimeoutMs: 5_000,
  helloTimeoutMs: 30_000,
  pingIntervalMs: 20_000,
};
