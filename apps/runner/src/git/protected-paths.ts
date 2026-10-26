import {
  CHANGED_PATHS_MAX,
  isProtectedPath,
  PROTECTED_PATHS_MAX,
} from '@nautelle/shared/protocol';
import type { Exec } from '../detect/exec';
import { gitOk } from '../skills/deps';

/**
 * C-148 (D-12, ADR-0077): the pre-push guard's diff. The paths the branch's
 * HEAD changes against its merge base with `origin/<base>` — a rename counts
 * under both names. `protectedPaths` are the protected ones
 * (`isProtectedPath`), sorted, at most `PROTECTED_PATHS_MAX`: the push goes
 * ahead either way; the API reads the list and never auto-merges the PR while
 * it is not empty. C-501: `changedPaths` are all of them, sorted, at most
 * `CHANGED_PATHS_MAX`, from the same diff; the API labels the card from them.
 */
export const diffPathsOf = async (
  exec: Exec,
  worktree: string,
  base: string,
): Promise<{ protectedPaths: string[]; changedPaths: string[] }> => {
  const changed = (
    await gitOk(exec, [
      '-C',
      worktree,
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      `refs/remotes/origin/${base}...HEAD`,
    ])
  )
    .split('\0')
    .filter((path) => path !== '')
    .sort();
  return {
    protectedPaths: changed
      .filter(isProtectedPath)
      .slice(0, PROTECTED_PATHS_MAX),
    changedPaths: changed.slice(0, CHANGED_PATHS_MAX),
  };
};
