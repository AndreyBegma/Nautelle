import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CardHandlers } from '../cards';
import { createExec } from '../detect/exec';
import { permissivePolicy } from '../policy/testing';
import { FakeClock } from '../testing/fake-clock';
import { hangingBinaries, isAlive } from '../testing/hanging';
import type { CommandHandlers } from './dispatcher';
import { createHandlers } from './handlers';

/**
 * #754: one command per family, run through `createHandlers` as the
 * dispatcher runs it. Its first child (`git`, `gh` or `tmux`) hangs; the
 * command's signal aborts, as on a timeout, and the child must be gone.
 */
const setup = () => {
  const bins = hangingBinaries(['git', 'gh', 'tmux']);
  const root = mkdtempSync(join(tmpdir(), 'nautelle-root-'));
  const handlers = createHandlers({
    clock: new FakeClock(),
    runnerVersion: '0.1.0',
    host: { hostname: 'test-host', os: 'linux', arch: 'x64' },
    detectCapabilities: async () => {
      throw new Error('not used');
    },
    exec: createExec(bins.env, 60_000),
    watchedProjects: () => [{ id: 'prj_a', root }],
    profiles: () => [],
    policy: permissivePolicy,
    cards: {} as CardHandlers,
  });
  return { bins, root, handlers };
};

const timesOut = async (
  run: (
    handlers: CommandHandlers,
    root: string,
    signal: AbortSignal,
  ) => unknown,
) => {
  const { bins, root, handlers } = setup();
  const controller = new AbortController();
  const settled = Promise.resolve()
    .then(() => run(handlers, root, controller.signal))
    .then(
      () => 'resolved',
      () => 'rejected',
    );
  const pid = await bins.started();
  expect(isAlive(pid)).toBe(true);
  controller.abort();
  await settled;
  return isAlive(pid);
};

describe('a command that times out kills its child (#754)', () => {
  it('queue: issue.create', async () => {
    const alive = await timesOut((h, _root, signal) =>
      h['issue.create'](
        {
          projectId: 'prj_a',
          title: 'A title',
          body: 'A body',
          labels: [],
          queue: false,
        },
        signal,
      ),
    );
    expect(alive).toBe(false);
  });

  it('approvals: pr.inspect', async () => {
    const alive = await timesOut((h, root, signal) =>
      h['pr.inspect']({ projectId: 'prj_a', root, pr: 7 }, signal),
    );
    expect(alive).toBe(false);
  });

  it('github: card.prOpen', async () => {
    const alive = await timesOut((h, root, signal) =>
      h['card.prOpen'](
        {
          cardId: 'card_1',
          projectId: 'prj_a',
          root,
          branch: 'card/c1-x',
          base: 'main',
          title: 'A title',
          body: 'A body',
        },
        signal,
      ),
    );
    expect(alive).toBe(false);
  });

  it('worktree: worktree.status', async () => {
    const alive = await timesOut((h, root, signal) =>
      h['worktree.status']({ projectId: 'prj_a', root, slot: 'a' }, signal),
    );
    expect(alive).toBe(false);
  });

  it('control: orchestrator.status', async () => {
    const alive = await timesOut((h, root, signal) =>
      h['orchestrator.status']({ projectId: 'prj_a', root }, signal),
    );
    expect(alive).toBe(false);
  });
});
