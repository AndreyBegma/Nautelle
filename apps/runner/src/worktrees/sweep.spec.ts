import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Exec } from '../detect/exec';
import { skillsWorkspace } from '../skills/testing';
import { memoryLogger } from '../testing/fixtures';
import { REAL_PROCESS_TIMEOUT_MS } from '../testing/projects';
import { removeRunnerWorktree } from './remove';
import { sweepRunnerWorktrees, sweepWatchedProjects } from './sweep';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS * 2);

let teardown: (() => void)[] = [];
afterEach(() => {
  for (const fn of teardown.reverse()) fn();
  teardown = [];
});

/** A temp repository `widget` and helpers to add worktrees beside it. */
const setup = async () => {
  const f = await skillsWorkspace();
  teardown.push(f.cleanup);
  const deps = { exec: f.git };
  const beside = (name: string) => join(f.ws, `.wt-widget-${name}`);
  const add = async (name: string) => {
    const path = beside(name);
    await f.run(f.root, 'worktree', 'add', '--quiet', '--detach', path);
    return path;
  };
  const listed = () => f.run(f.root, 'worktree', 'list', '--porcelain');
  return { f, deps, beside, add, listed };
};

describe('sweepRunnerWorktrees (#1045)', () => {
  it('removes orphaned plan and review worktrees; keeps recorded, card and slot ones', async () => {
    const t = await setup();
    const orphanPlan = await t.add('plan-orph0001');
    const keptPlan = await t.add('plan-kept0001');
    const orphanReview = await t.add('review-orphan01');
    const keptReview = await t.add('review-kept0001');
    const turnPlan = await t.add('plan-turn0001');
    const card = await t.add('card-abc12345');
    const slot = await t.add('a');
    // A directory a failed remove left behind: no worktree, the prefix only.
    const leftover = t.beside('plan-leftov01');
    mkdirSync(join(leftover, 'src'), { recursive: true });
    // Neither a worktree nor the prefix exactly (D4).
    const lookalike = t.beside('plan-NOT_OURS');
    mkdirSync(lookalike);
    // Registered with git, its directory already gone.
    const vanished = await t.add('review-vanish01');
    rmSync(vanished, { recursive: true, force: true });

    const removed = await sweepRunnerWorktrees(t.deps, t.f.root, {
      inUse: () => [keptPlan, keptReview, turnPlan, card],
      minAgeMs: 0,
    });

    expect(removed.map((p) => basename(p)).sort()).toEqual([
      '.wt-widget-plan-leftov01',
      '.wt-widget-plan-orph0001',
      '.wt-widget-review-orphan01',
      '.wt-widget-review-vanish01',
    ]);
    for (const gone of [orphanPlan, orphanReview, leftover]) {
      expect(existsSync(gone)).toBe(false);
    }
    for (const kept of [
      keptPlan,
      keptReview,
      turnPlan,
      card,
      slot,
      lookalike,
    ]) {
      expect(existsSync(kept)).toBe(true);
    }
    const listed = await t.listed();
    for (const gone of [orphanPlan, orphanReview, vanished]) {
      expect(listed).not.toContain(gone);
    }
    for (const kept of [keptPlan, keptReview, turnPlan, card, slot]) {
      expect(listed).toContain(kept);
    }
  });

  it('keeps a worktree younger than the minimum age, then sweeps it', async () => {
    const t = await setup();
    const fresh = await t.add('review-fresh001');
    const sweep = (now: number) =>
      sweepRunnerWorktrees(t.deps, t.f.root, {
        inUse: () => [],
        now: () => now,
      });
    expect(await sweep(Date.now())).toEqual([]);
    expect(existsSync(fresh)).toBe(true);
    expect(await sweep(Date.now() + 60 * 60_000)).toEqual([fresh]);
    expect(existsSync(fresh)).toBe(false);
  });

  it('reads the records again before each removal', async () => {
    const t = await setup();
    await t.add('plan-first001');
    const second = await t.add('plan-secnd001');
    // A plan recorded while the sweep runs: named after the first removal.
    let calls = 0;
    const removed = await sweepRunnerWorktrees(t.deps, t.f.root, {
      inUse: () => (calls++ > 0 ? [second] : []),
      minAgeMs: 0,
    });
    expect(removed.map((p) => basename(p))).toEqual([
      '.wt-widget-plan-first001',
    ]);
    expect(existsSync(second)).toBe(true);
  });

  it('logs one line per watched project with the count', async () => {
    const t = await setup();
    await t.add('plan-orph0001');
    const { log, lines } = memoryLogger();
    await sweepWatchedProjects(t.deps, [t.f.project], {
      inUse: () => [],
      minAgeMs: 0,
      log,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      'worktrees: swept orphaned plan and review worktrees',
    );
    expect(lines[0]).toContain('prj_widget');
    expect(lines[0]).toMatch(/"removed":\s*1\b|removed=1\b/);
  });
});

describe('removeRunnerWorktree (#1045 D1)', () => {
  it('removes the directory when git worktree remove fails', async () => {
    const t = await setup();
    const worktree = await t.add('plan-broken01');
    const failing: Exec = async (binary, args, options) =>
      args.includes('remove')
        ? { code: 128, stdout: '', stderr: 'fatal: cannot remove' }
        : t.f.git(binary, args, options);
    expect(
      await removeRunnerWorktree({ exec: failing }, t.f.root, worktree),
    ).toBe(true);
    expect(existsSync(worktree)).toBe(false);
    // git forgot it too.
    expect(await t.listed()).not.toContain(worktree);
    expect(
      await removeRunnerWorktree({ exec: failing }, t.f.root, worktree),
    ).toBe(false);
  });
});
