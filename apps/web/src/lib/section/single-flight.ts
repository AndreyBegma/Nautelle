/** One load at a time, as `singleFlight` runs them. */
export interface SingleFlight {
  /** Starts a load, or — while one runs — one more after it settles. */
  request: () => void;
  /** No load starts after this; one already running still settles. */
  dispose: () => void;
}

/**
 * C-364: coalesces reloads. While a load runs, every further request folds
 * into one that starts when it settles, so a steady stream of live events
 * never cancels a load before it lands, and at most one is in flight.
 */
export function singleFlight(run: () => Promise<unknown>): SingleFlight {
  let running = false;
  let again = false;
  let disposed = false;
  const start = () => {
    running = true;
    const settle = () => {
      running = false;
      if (again && !disposed) {
        again = false;
        start();
      }
    };
    run().then(settle, settle);
  };
  return {
    request: () => {
      if (disposed) return;
      if (running) again = true;
      else start();
    },
    dispose: () => {
      disposed = true;
    },
  };
}
