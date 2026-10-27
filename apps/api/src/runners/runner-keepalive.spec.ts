import { EventEmitter } from 'node:events';
import { keepAlive } from './runner-keepalive';

/** A socket that counts pings and answers only when the test says so. */
class FakeSocket extends EventEmitter {
  pings = 0;
  ping(): void {
    this.pings++;
  }
  pong(): void {
    this.emit('pong');
  }
}

describe('keepAlive (#1057 D4)', () => {
  const INTERVAL = 20_000;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pings every interval and ends a socket that missed two pings', () => {
    const socket = new FakeSocket();
    const dead = jest.fn();
    keepAlive(socket, INTERVAL, dead);

    jest.advanceTimersByTime(INTERVAL);
    expect(socket.pings).toBe(1);
    jest.advanceTimersByTime(INTERVAL);
    expect(socket.pings).toBe(2);
    expect(dead).not.toHaveBeenCalled();

    // The third tick finds both unanswered.
    jest.advanceTimersByTime(INTERVAL);
    expect(dead).toHaveBeenCalledTimes(1);
    expect(socket.pings).toBe(2);

    // Stopped: no further pings, no second call.
    jest.advanceTimersByTime(10 * INTERVAL);
    expect(socket.pings).toBe(2);
    expect(dead).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('pong')).toBe(0);
  });

  it('a pong resets the count, so a live socket is never ended', () => {
    const socket = new FakeSocket();
    const dead = jest.fn();
    keepAlive(socket, INTERVAL, dead);

    for (let tick = 0; tick < 20; tick++) {
      jest.advanceTimersByTime(INTERVAL);
      // Answers every other ping: never two misses in a row.
      if (tick % 2 === 1) socket.pong();
    }
    expect(socket.pings).toBe(20);
    expect(dead).not.toHaveBeenCalled();
  });

  it('stop ends the pings and drops the pong listener', () => {
    const socket = new FakeSocket();
    const dead = jest.fn();
    const stop = keepAlive(socket, INTERVAL, dead);
    jest.advanceTimersByTime(INTERVAL);
    stop();
    jest.advanceTimersByTime(10 * INTERVAL);
    expect(socket.pings).toBe(1);
    expect(dead).not.toHaveBeenCalled();
    expect(socket.listenerCount('pong')).toBe(0);
  });
});
