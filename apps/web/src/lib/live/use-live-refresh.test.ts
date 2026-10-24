import { describe, expect, test } from 'bun:test';
import { MAX_LIVE_SUBSCRIPTIONS } from '@nautelle/shared';
import { createBurstFolder, followedProjectTopics } from './use-live-refresh';

function folderWith(delayMs: number) {
  const timers = new Map<number, () => void>();
  let next = 1;
  let fired = 0;
  const folder = createBurstFolder(
    () => {
      fired += 1;
    },
    delayMs,
    {
      set: (fn) => {
        timers.set(next, fn);
        return next++;
      },
      clear: (id) => {
        timers.delete(id as number);
      },
    },
  );
  const elapse = () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id);
      fn();
    }
  };
  return { folder, timers, elapse, fired: () => fired };
}

describe('createBurstFolder', () => {
  test('a burst of events reloads once', () => {
    const { folder, timers, elapse, fired } = folderWith(300);
    for (let i = 0; i < 20; i += 1) folder.poke();
    expect(timers.size).toBe(1);
    elapse();
    expect(fired()).toBe(1);
  });

  test('a steady stream still reloads: the window is not restarted', () => {
    const { folder, elapse, fired } = folderWith(300);
    for (let window = 1; window <= 3; window += 1) {
      folder.poke();
      folder.poke();
      elapse();
      expect(fired()).toBe(window);
    }
  });

  test('cancel drops the pending reload', () => {
    const { folder, timers, elapse, fired } = folderWith(300);
    folder.poke();
    folder.cancel();
    expect(timers.size).toBe(0);
    elapse();
    expect(fired()).toBe(0);
    folder.poke();
    elapse();
    expect(fired()).toBe(1);
  });
});

describe('followedProjectTopics', () => {
  test('follows every project while the socket has room', () => {
    const ids = ['a', 'b', 'c'];
    expect(followedProjectTopics(ids)).toEqual({
      followed: ids,
      covered: true,
    });
  });

  test('keeps room for the page’s own topics and says when it falls short', () => {
    const ids = Array.from(
      { length: MAX_LIVE_SUBSCRIPTIONS },
      (_, n) => `p${n}`,
    );
    const { followed, covered } = followedProjectTopics(ids);
    expect(followed.length).toBeLessThan(MAX_LIVE_SUBSCRIPTIONS);
    expect(followed).toEqual(ids.slice(0, followed.length));
    expect(covered).toBe(false);
  });
});
