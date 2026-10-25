import {
  PROJECT_PUSH_CHECK_TIMEOUT_MS,
  type ProjectPushCheckResult,
  TEXT_MESSAGE_MAX,
} from '@nautelle/shared/protocol';
import { CommandFailure } from '../commands/failure';
import type { Exec } from '../detect/exec';
import { redactUrlUserinfo, stripUrlCredentials } from '../redact-url';
import { isDirectory, nodeFs, type ProjectFs } from './fs';

/** The branch the dry run names; nothing is ever pushed to it. */
export const PUSH_CHECK_BRANCH = 'nautelle/push-check';
/** git gives up before the command does, so the answer is a result, not a timeout. */
export const PUSH_CHECK_EXEC_TIMEOUT_MS = PROJECT_PUSH_CHECK_TIMEOUT_MS - 5_000;
/** How many of git's last output lines the result keeps. */
const MESSAGE_LINES = 6;

export interface PushCheckDeps {
  exec: Exec;
  fs?: ProjectFs;
}

const tail = (text: string): string =>
  redactUrlUserinfo(
    text
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(-MESSAGE_LINES)
      .join('\n'),
  ).slice(-TEXT_MESSAGE_MAX);

/**
 * `project.push_check` (C-396, ADR-0102): whether this runner can push to the
 * repository's origin — `git push --dry-run` of `HEAD` to a branch no one
 * uses. git authenticates and asks the remote for its refs, then stops before
 * sending anything. The runner's git gets the same settings as every other
 * call (`GitAuth.wrap`), so the check sees what a card worker's push will.
 */
export const pushCheck = async (
  path: string,
  deps: PushCheckDeps,
): Promise<ProjectPushCheckResult> => {
  const fs = deps.fs ?? nodeFs;
  if (!isDirectory(fs, path)) {
    throw new CommandFailure('path_not_found', `${path} is not a directory`);
  }
  const toplevel = await deps.exec('git', [
    '-C',
    path,
    'rev-parse',
    '--show-toplevel',
  ]);
  if (toplevel === null) {
    throw new Error('git is not installed on this runner');
  }
  const root = toplevel.code === 0 ? toplevel.stdout.trim() : '';
  if (!root) {
    throw new CommandFailure(
      'not_a_repository',
      `${path} is not inside a git working tree`,
    );
  }
  const origin = await deps.exec('git', [
    '-C',
    root,
    'remote',
    'get-url',
    'origin',
  ]);
  const url = origin?.code === 0 ? origin.stdout.trim() : '';
  if (!url) {
    return {
      ok: false,
      remote: null,
      message: 'The repository has no `origin` remote.',
    };
  }
  const remote = stripUrlCredentials(url).url;
  const push = await deps.exec(
    'git',
    [
      '-C',
      root,
      'push',
      '--dry-run',
      '--porcelain',
      'origin',
      `HEAD:refs/heads/${PUSH_CHECK_BRANCH}`,
    ],
    { timeoutMs: PUSH_CHECK_EXEC_TIMEOUT_MS },
  );
  if (push === null) {
    return {
      ok: false,
      remote,
      message: `git push --dry-run did not finish in ${PUSH_CHECK_EXEC_TIMEOUT_MS / 1000} s; is origin reachable without a prompt?`,
    };
  }
  if (push.code === 0) {
    return { ok: true, remote, message: `${remote} accepts pushes.` };
  }
  return {
    ok: false,
    remote,
    message:
      tail(`${push.stderr}\n${push.stdout}`) ||
      `git push --dry-run exited with ${push.code}`,
  };
};
