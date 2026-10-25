import type { Exec } from '../detect/exec';

/**
 * #949: the tracked paths of `top` that differ from `HEAD`, staged or not;
 * `null` when git cannot tell (no git, not a repository).
 */
export const changedTrackedFiles = async (
  exec: Exec,
  top: string,
): Promise<Set<string> | null> => {
  const diff = await exec('git', [
    '-C',
    top,
    'diff',
    'HEAD',
    '--name-only',
    '--no-renames',
    '-z',
  ]);
  if (!diff || diff.code !== 0) return null;
  return new Set(diff.stdout.split('\0').filter((path) => path !== ''));
};

/**
 * #949: a recording's app rewrites tracked files (`next dev` rewrites
 * `next-env.d.ts`), and collect would commit them into a pull request of
 * their own. Every tracked file that was unchanged before the recording
 * (`before`) and differs from `HEAD` after it goes back to `HEAD`; a file the
 * worker had already changed is left as it is. Returns the restored paths.
 */
export const restoreTrackedFiles = async (
  exec: Exec,
  top: string,
  before: ReadonlySet<string>,
): Promise<string[]> => {
  const after = await changedTrackedFiles(exec, top);
  if (after === null) return [];
  const touched = [...after].filter((path) => !before.has(path)).sort();
  if (touched.length === 0) return [];
  const restored = await exec('git', [
    '-C',
    top,
    'checkout',
    'HEAD',
    '--',
    ...touched,
  ]);
  if (!restored || restored.code !== 0) {
    throw new Error(
      `git could not restore ${touched.join(', ')}: ${restored?.stderr.trim() ?? 'git did not run'}`,
    );
  }
  return touched;
};
