import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { WatchedProject } from '@nautelle/shared/protocol';
import type { GitDeps } from '../cards/git';
import { errorMessage, type Logger } from '../log';
import { removeRunnerWorktree } from './remove';

/**
 * #1045 D2: a directory younger than this is never swept — a review worktree
 * exists for a moment before its record is saved.
 */
export const SWEEP_MIN_AGE_MS = 10 * 60_000;

/**
 * #1045 D4: the only worktrees the sweep may remove, beside the main checkout:
 * `.wt-<repo>-plan-<shortId>` (`planWorktreePath`) and
 * `.wt-<repo>-review-<shortId>` (`cardReviewWorktreePath`). Card and slot
 * worktrees never match.
 */
const RUNNER_WORKTREE = /^(?:plan-[a-z0-9]{6,16}|review-[a-z0-9]{8})$/;

/** Whether `path` is a plan or review worktree path of the checkout at `root`. */
export const isSweptWorktreeName = (root: string, path: string): boolean => {
  const trimmed = root.replace(/\/+$/, '');
  const lead = `.wt-${basename(trimmed)}-`;
  const name = basename(path);
  return name.startsWith(lead) && RUNNER_WORKTREE.test(name.slice(lead.length));
};

/** The path with symlinks resolved when it exists, else only made absolute. */
const canonical = (path: string): string => {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
};

/** Worktrees git lists for `root`, empty when git cannot say. */
const listedWorktrees = async (
  deps: Pick<GitDeps, 'exec'>,
  root: string,
): Promise<string[]> => {
  const listed = await deps.exec('git', [
    '-C',
    root,
    'worktree',
    'list',
    '--porcelain',
  ]);
  if (!listed || listed.code !== 0) return [];
  return listed.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
};

/** Directories beside `root`, empty when its parent cannot be read. */
const siblingDirectories = (root: string): string[] => {
  const parent = dirname(root.replace(/\/+$/, ''));
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  } catch {
    return [];
  }
};

/** Whether the directory at `path` was last changed within `minAgeMs`. */
const isRecent = (path: string, now: number, minAgeMs: number): boolean => {
  try {
    return now - statSync(path).mtimeMs < minAgeMs;
  } catch {
    return false;
  }
};

export interface SweepOptions {
  /**
   * The worktrees records name, read again before each removal so a plan or
   * review that starts while the sweep runs keeps its worktree.
   */
  inUse: () => Iterable<string>;
  minAgeMs?: number;
  now?: () => number;
}

/**
 * #1045 D2: removes every plan and review worktree of the checkout at `root`
 * — registered with git or only a directory beside it — that `inUse` does
 * not name, then prunes. Answers the paths removed.
 */
export const sweepRunnerWorktrees = async (
  deps: Pick<GitDeps, 'exec'>,
  root: string,
  options: SweepOptions,
): Promise<string[]> => {
  const parent = canonical(dirname(root.replace(/\/+$/, '')));
  const candidates = new Map<string, string>();
  for (const path of [
    ...(await listedWorktrees(deps, root)),
    ...siblingDirectories(root),
  ]) {
    if (!isSweptWorktreeName(root, path)) continue;
    if (canonical(dirname(path)) !== parent) continue;
    const key = canonical(path);
    if (!candidates.has(key)) candidates.set(key, path);
  }
  const now = (options.now ?? Date.now)();
  const minAgeMs = options.minAgeMs ?? SWEEP_MIN_AGE_MS;
  const removed: string[] = [];
  for (const [key, path] of candidates) {
    if (existsSync(path) && isRecent(path, now, minAgeMs)) continue;
    const kept = new Set([...options.inUse()].map(canonical));
    if (kept.has(key)) continue;
    await removeRunnerWorktree(deps, root, path);
    removed.push(path);
  }
  await deps.exec('git', ['-C', root, 'worktree', 'prune']);
  return removed;
};

/**
 * #1045 D2: sweeps every watched project, one log line each with the count.
 * A project that cannot be swept is logged and the next one is swept.
 */
export const sweepWatchedProjects = async (
  deps: Pick<GitDeps, 'exec'>,
  projects: readonly WatchedProject[],
  options: SweepOptions & { log: Logger },
): Promise<void> => {
  for (const project of projects) {
    try {
      const removed = await sweepRunnerWorktrees(deps, project.root, options);
      options.log.info('worktrees: swept orphaned plan and review worktrees', {
        projectId: project.id,
        removed: removed.length,
      });
    } catch (error) {
      options.log.warn('worktrees: cannot sweep a project', {
        projectId: project.id,
        error: errorMessage(error),
      });
    }
  }
};
