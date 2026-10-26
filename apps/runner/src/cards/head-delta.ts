import { tmpdir } from 'node:os';
import type {
  CardHeadDeltaArgs,
  CardHeadDeltaResult,
  WatchedProject,
} from '@nautelle/shared/protocol';
import { watchedProject } from '../control/target';
import type { Exec } from '../detect/exec';
import { gitOk, gitSucceeds } from '../skills/deps';
import { commitOf, fetchRef, type GitDeps } from './git';

export interface CardHeadDeltaDeps {
  exec: Exec;
  watchedProjects: () => readonly WatchedProject[];
}

/** `merge-tree --write-tree` came with git 2.38. */
const MERGE_TREE_WRITE_TREE = [2, 38] as const;

/** Whether `git version` names a release with `merge-tree --write-tree`. */
const hasWriteTree = async (exec: Exec): Promise<boolean> => {
  const result = await exec('git', ['version']);
  const match = /(\d+)\.(\d+)/.exec(result?.stdout ?? '');
  if (result?.code !== 0 || !match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  const [needMajor, needMinor] = MERGE_TREE_WRITE_TREE;
  return major > needMajor || (major === needMajor && minor >= needMinor);
};

/** The commit `sha`, fetched from origin when the repository lacks it. */
const fetchedCommit = async (
  deps: GitDeps,
  root: string,
  sha: string,
): Promise<string | null> => {
  const commit = await commitOf(deps, root, sha);
  if (commit) return commit;
  await fetchRef(deps, root, sha);
  return commitOf(deps, root, sha);
};

/**
 * C-457 (ADR-0001, ADR-0010): whether `to` only merges `origin/<base>` into
 * `from`, cleanly — two parents, one `from` and the other in the base, and
 * the tree `git merge-tree --write-tree` makes of them. Read-only: fetches,
 * then commit and tree reads; no checkout, no worktree. A "no" is a result
 * with its reason, never a thrown command error; only a target that is not a
 * watched project, or git failing outright, throws.
 */
export const cardHeadDelta = async (
  args: CardHeadDeltaArgs,
  deps: CardHeadDeltaDeps,
): Promise<CardHeadDeltaResult> => {
  const { root } = watchedProject(args, deps.watchedProjects());
  // Only `exec` is used: nothing here writes a file.
  const git: GitDeps = { exec: deps.exec, tempRoot: tmpdir() };
  if (!(await hasWriteTree(deps.exec))) {
    return { baseMerge: false, reason: 'git_too_old' };
  }
  await fetchRef(git, root, args.base);
  const from = await fetchedCommit(git, root, args.from);
  const to = await fetchedCommit(git, root, args.to);
  if (!from || !to) return { baseMerge: false, reason: 'unknown_commit' };

  const parents = (
    await gitOk(deps.exec, ['-C', root, 'rev-list', '--parents', '-n', '1', to])
  )
    .trim()
    .split(' ')
    .slice(1);
  if (parents.length !== 2) return { baseMerge: false, reason: 'not_a_merge' };
  const other = parents.find((parent) => parent !== from);
  if (!parents.includes(from) || !other) {
    return { baseMerge: false, reason: 'parent_mismatch' };
  }
  const onBase = await gitSucceeds(deps.exec, [
    '-C',
    root,
    'merge-base',
    '--is-ancestor',
    other,
    `refs/remotes/origin/${args.base}`,
  ]);
  if (!onBase) return { baseMerge: false, reason: 'not_on_base' };

  // Exit 1 is a conflicted merge: whatever `to` holds was resolved by hand.
  const merged = await deps.exec('git', [
    '-C',
    root,
    'merge-tree',
    '--write-tree',
    '--no-messages',
    from,
    other,
  ]);
  if (merged?.code === 1) return { baseMerge: false, reason: 'tree_differs' };
  if (merged?.code !== 0) {
    throw new Error(`git merge-tree failed: ${merged?.stderr.trim() ?? ''}`);
  }
  const mergedTree = merged.stdout.trim().split('\n')[0];
  const tree = (
    await gitOk(deps.exec, ['-C', root, 'rev-parse', `${to}^{tree}`])
  ).trim();
  return mergedTree === tree
    ? { baseMerge: true }
    : { baseMerge: false, reason: 'tree_differs' };
};
