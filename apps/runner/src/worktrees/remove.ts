import { existsSync, rmSync } from 'node:fs';
import type { GitDeps } from '../cards/git';

/**
 * #1045 D1: removes a worktree the runner made for a plan or a review —
 * `git worktree remove --force`, then whatever directory is left (a remove
 * that failed leaves it), then `prune`, so git forgets it either way. Never
 * throws for a failed git call. Answers whether there was a directory.
 */
export const removeRunnerWorktree = async (
  deps: Pick<GitDeps, 'exec'>,
  root: string,
  worktree: string,
): Promise<boolean> => {
  const existed = existsSync(worktree);
  if (existed) {
    await deps.exec('git', [
      '-C',
      root,
      'worktree',
      'remove',
      '--force',
      worktree,
    ]);
    rmSync(worktree, { recursive: true, force: true });
  }
  await deps.exec('git', ['-C', root, 'worktree', 'prune']);
  return existed;
};
