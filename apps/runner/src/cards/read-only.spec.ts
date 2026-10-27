import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REAL_PROCESS_TIMEOUT_MS } from '../testing/projects';
import {
  placeReadOnlyWorktree,
  READ_ONLY_GUARD_MAX_REJECTIONS,
  ReadOnlyGuard,
  type ReadOnlyWorktree,
  readOnlyChanges,
  resetReadOnlyWorktree,
} from './read-only';
import { cardsWorkspace } from './testing';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS * 2);

let teardown: (() => void)[] = [];
afterEach(() => {
  for (const fn of teardown.reverse()) fn();
  teardown = [];
});

const START = 'a'.repeat(40);

/** A worktree whose changes the test sets; `resets` counts the resets. */
const fakeWorktree = (changes: string[]) => {
  const state = { changes, resets: 0 };
  const git: ReadOnlyWorktree = {
    changes: async () => state.changes,
    reset: async () => {
      state.resets += 1;
      state.changes = [];
    },
  };
  return { state, git };
};

describe('ReadOnlyGuard (C-504 D2.4)', () => {
  it('accepts an untouched worktree at once, unflagged', async () => {
    const { state, git } = fakeWorktree([]);
    const guard = new ReadOnlyGuard({ worktree: '/wt', start: START, git });
    expect(await guard.check()).toEqual({
      kind: 'accept',
      readOnlyViolation: false,
    });
    expect(state.resets).toBe(0);
  });

  it('refuses a changed worktree twice, naming the paths, then resets it and accepts flagged', async () => {
    const { state, git } = fakeWorktree(['src/app.txt', 'notes.md']);
    const guard = new ReadOnlyGuard({ worktree: '/wt', start: START, git });
    for (let i = 0; i < READ_ONLY_GUARD_MAX_REJECTIONS; i++) {
      const decision = await guard.check();
      expect(decision.kind).toBe('reject');
      if (decision.kind !== 'reject') return;
      expect(decision.message).toContain('- src/app.txt');
      expect(decision.message).toContain('- notes.md');
      expect(decision.message).toContain('finish_analysis');
    }
    expect(state.resets).toBe(0);
    expect(await guard.check()).toEqual({
      kind: 'accept',
      readOnlyViolation: true,
    });
    expect(state.resets).toBe(1);
  });

  it('accepts unflagged once the session undid its changes', async () => {
    const { state, git } = fakeWorktree(['src/app.txt']);
    const guard = new ReadOnlyGuard({ worktree: '/wt', start: START, git });
    expect((await guard.check()).kind).toBe('reject');
    state.changes = [];
    expect(await guard.check()).toEqual({
      kind: 'accept',
      readOnlyViolation: false,
    });
    expect(state.resets).toBe(0);
  });

  it('lists at most 20 changes and counts the rest', async () => {
    const changes = Array.from({ length: 25 }, (_, i) => `f${i}.txt`);
    const guard = new ReadOnlyGuard({
      worktree: '/wt',
      start: START,
      git: fakeWorktree(changes).git,
    });
    const decision = await guard.check();
    if (decision.kind !== 'reject') throw new Error('expected a refusal');
    expect(decision.message).toContain('- f19.txt');
    expect(decision.message).not.toContain('- f20.txt');
    expect(decision.message).toContain('- and 5 more');
  });

  it('counts a worktree it cannot read as changed, and still relays on the third call', async () => {
    const warnings: string[] = [];
    const guard = new ReadOnlyGuard({
      worktree: '/wt',
      start: START,
      git: {
        changes: async () => {
          throw new Error('not a git repository');
        },
        reset: async () => {
          throw new Error('not a git repository');
        },
      },
      warn: (message) => warnings.push(message),
    });
    const first = await guard.check();
    expect(first.kind).toBe('reject');
    if (first.kind === 'reject') {
      expect(first.message).toContain('the worktree could not be read');
    }
    expect((await guard.check()).kind).toBe('reject');
    expect(await guard.check()).toEqual({
      kind: 'accept',
      readOnlyViolation: true,
    });
    expect(warnings).toContain('the worktree could not be reset');
  });
});

describe('the read-only worktree against real git (C-504 D2.2, D2.4, D4)', () => {
  const setup = async () => {
    const f = await cardsWorkspace();
    teardown.push(f.cleanup);
    const deps = f.deps(f.exec);
    const worktree = join(f.ws, '.wt-widget-card-ab12cd34');
    await placeReadOnlyWorktree(
      deps,
      { root: f.root, worktree, base: 'main' },
      false,
    );
    const start = await f.run(worktree, 'rev-parse', 'HEAD');
    return { f, deps, worktree, start };
  };

  it('places a detached worktree at origin/<base> and sees no changes in it', async () => {
    const { f, deps, worktree, start } = await setup();
    expect(existsSync(worktree)).toBe(true);
    expect(start).toBe(await f.run(f.root, 'rev-parse', 'origin/main'));
    expect(await f.run(worktree, 'branch', '--show-current')).toBe('');
    expect(await readOnlyChanges(deps, worktree, start)).toEqual([]);
  });

  it('names edited, untracked and staged paths and a moved HEAD — not ignored files', async () => {
    const { f, deps, worktree, start } = await setup();
    f.write(worktree, {
      '.gitignore': 'build/\n',
      'src/app.txt': 'edited\n',
      'src/new/deep.txt': 'new\n',
      'build/out.js': 'ignored\n',
    });
    await f.run(worktree, 'add', '.gitignore');
    const changes = await readOnlyChanges(deps, worktree, start);
    expect(changes).toEqual(
      expect.arrayContaining(['.gitignore', 'src/app.txt', 'src/new/deep.txt']),
    );
    expect(changes.some((c) => c.startsWith('build/'))).toBe(false);

    await f.commitAll(worktree, 'chore: a commit it must not make');
    const moved = await readOnlyChanges(deps, worktree, start);
    expect(moved).toEqual([
      `HEAD moved from ${start.slice(0, 12)} to ${(await f.run(worktree, 'rev-parse', 'HEAD')).slice(0, 12)}`,
    ]);
  });

  it('resets to the start: no changes, HEAD back, ignored files kept', async () => {
    const { f, deps, worktree, start } = await setup();
    f.write(worktree, { 'src/app.txt': 'edited\n' });
    await f.commitAll(worktree, 'chore: a commit it must not make');
    // Worktrees share the main checkout's `info/exclude`.
    f.write(f.root, { '.git/info/exclude': 'cache/\n' });
    f.write(worktree, {
      'src/app.txt': 'edited again\n',
      'scratch/a.txt': 'x\n',
      'cache/keep.bin': 'kept\n',
    });
    await resetReadOnlyWorktree(deps, worktree, start);
    expect(await readOnlyChanges(deps, worktree, start)).toEqual([]);
    expect(await f.run(worktree, 'rev-parse', 'HEAD')).toBe(start);
    expect(existsSync(join(worktree, 'cache', 'keep.bin'))).toBe(true);
    expect(existsSync(join(worktree, 'scratch'))).toBe(false);
  });
});
