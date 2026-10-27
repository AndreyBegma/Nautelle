/** Unanswered pings after which a runner socket is dead (#1057 D4). */
export const MISSED_PINGS_LIMIT = 2;

/** What {@link keepAlive} needs of a `ws` socket. */
export interface PingedSocket {
  ping(): void;
  on(event: 'pong', listener: () => void): unknown;
  off(event: 'pong', listener: () => void): unknown;
}

/**
 * Pings `socket` every `intervalMs` and calls `dead` once it has left
 * `MISSED_PINGS_LIMIT` pings unanswered — a link that died without a close
 * never reports one. Any pong resets the count. Returns the stop function;
 * `dead` stops it too.
 */
export const keepAlive = (
  socket: PingedSocket,
  intervalMs: number,
  dead: () => void,
): (() => void) => {
  let missed = 0;
  const pong = (): void => {
    missed = 0;
  };
  const timer = setInterval(() => {
    if (missed >= MISSED_PINGS_LIMIT) {
      stop();
      dead();
      return;
    }
    missed++;
    socket.ping();
  }, intervalMs);
  timer.unref();
  socket.on('pong', pong);
  const stop = (): void => {
    clearInterval(timer);
    socket.off('pong', pong);
  };
  return stop;
};
