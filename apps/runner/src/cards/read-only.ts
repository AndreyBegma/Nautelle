import { existsSync } from 'node:fs';
import type { LocalErrorCode } from '@nautelle/shared/protocol';
import { CommandFailure } from '../commands/failure';
import { gitOk, type SkillsDeps } from '../skills/deps';
import { commitOf, fetchRef, type GitDeps } from './git';
import type { CardRecord } from './record';

/**
 * C-504 (ADR-0126): an analysis card's round runs read-only. Four layers keep
 * the repository clean — the launch's deny rules (`READ_ONLY_DENIED_TOOLS`),
 * a detached worktree with no branch or upstream (`placeReadOnlyWorktree`),
 * no push or pull request from the runner (`card.run` takes no
 * `pullRequest` with `readOnly`, `card.collect` is refused), and the
 * daemon's guard on `finish_analysis` (`ReadOnlyGuard`).
 */

/** The tool error code of a finish the read-only guard refused. */
export const READ_ONLY_VIOLATION =
  'read_only_violation' satisfies LocalErrorCode;

/** D2.4: after this many refusals in a round the worktree is reset and the finish relayed. */
export const READ_ONLY_GUARD_MAX_REJECTIONS = 2;

/**
 * D2.2: the card's worktree, detached at the updated `origin/<base>` — made
 * when it is missing, else moved there. `discard` (the last round was
 * read-only too, so nothing in it is the person's) throws away what that
 * round left. Otherwise the worktree is a writing round's: uncommitted work
 * in it is the person's, so the round is refused with `invalid_args` rather
 * than carried into the session, blamed on it and reset by the guard.
 */
export const placeReadOnlyWorktree = async (
  deps: GitDeps,
  record: Pick<CardRecord, 'root' | 'worktree' | 'base'>,
  discard: boolean,
): Promise<void> => {
  const { root, worktree, base } = record;
  await fetchRef(deps, root, base);
  const start = await commitOf(deps, root, `refs/remotes/origin/${base}`);
  if (!start) throw new Error(`origin/${base} does not exist`);
  if (!existsSync(worktree)) {
    await gitOk(deps.exec, [
      '-C',
      root,
      'worktree',
      'add',
      '--quiet',
      '--detach',
      worktree,
      start,
    ]);
    return;
  }
  if (discard) {
    await resetReadOnlyWorktree(deps, worktree, start);
    return;
  }
  const dirty = await statusPaths(deps, worktree);
  if (dirty.length > 0) {
    throw new CommandFailure(
      'invalid_args',
      `${worktree} has uncommitted changes from an earlier round ` +
        `(${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', …' : ''}); ` +
        'commit or discard them before a read-only round',
    );
  }
  await gitOk(deps.exec, [
    '-C',
    worktree,
    'switch',
    '--quiet',
    '--detach',
    start,
  ]);
};

/**
 * D2.4: what the session changed since `start` — every path `git status`
 * names (ignored files do not count, D4), and HEAD when it moved. Empty is
 * an untouched worktree.
 */
export const readOnlyChanges = async (
  deps: Pick<SkillsDeps, 'exec'>,
  worktree: string,
  start: string,
): Promise<string[]> => {
  const changes = await statusPaths(deps, worktree);
  const head = (
    await gitOk(deps.exec, ['-C', worktree, 'rev-parse', 'HEAD'])
  ).trim();
  if (head !== start) {
    changes.push(
      `HEAD moved from ${start.slice(0, 12)} to ${head.slice(0, 12)}`,
    );
  }
  return changes;
};

/** Every path `git status` names in `worktree`; ignored files do not count. */
const statusPaths = async (
  deps: Pick<SkillsDeps, 'exec'>,
  worktree: string,
): Promise<string[]> => {
  const status = await gitOk(deps.exec, [
    '-C',
    worktree,
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]);
  return status
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3));
};

/**
 * D2.4: the worktree back at `start`, detached, with nothing the session
 * wrote — the worktree is the runner's. Ignored files stay (D4).
 */
export const resetReadOnlyWorktree = async (
  deps: Pick<SkillsDeps, 'exec'>,
  worktree: string,
  start: string,
): Promise<void> => {
  await gitOk(deps.exec, [
    '-C',
    worktree,
    'checkout',
    '--quiet',
    '--force',
    '--detach',
    start,
  ]);
  await gitOk(deps.exec, ['-C', worktree, 'clean', '--quiet', '-fd']);
};

/** What the guard decides for one `finish_analysis` call. */
export type ReadOnlyGuardDecision =
  | { kind: 'accept'; readOnlyViolation: boolean }
  | { kind: 'reject'; message: string };

/** How the guard reads and resets a worktree; git by default (the daemon's). */
export interface ReadOnlyWorktree {
  changes: (worktree: string, start: string) => Promise<string[]>;
  reset: (worktree: string, start: string) => Promise<void>;
}

/** The changes listed in a refusal; the rest are counted. */
const LISTED_CHANGES_MAX = 20;

/**
 * D2.4: refuses a finish from a worktree that changed, naming the changes,
 * twice; the third attempt resets the worktree and is accepted with
 * `readOnlyViolation: true`. An untouched worktree is always accepted as is.
 * A worktree that cannot be read counts as changed.
 */
export class ReadOnlyGuard {
  private rejections = 0;

  constructor(
    private readonly options: {
      worktree: string;
      start: string;
      git: ReadOnlyWorktree;
      warn?: (message: string, error: unknown) => void;
    },
  ) {}

  async check(): Promise<ReadOnlyGuardDecision> {
    const { worktree, start, git } = this.options;
    let changes: string[];
    try {
      changes = await git.changes(worktree, start);
    } catch (error) {
      this.options.warn?.('the worktree could not be read', error);
      changes = ['the worktree could not be read'];
    }
    if (changes.length === 0) {
      return { kind: 'accept', readOnlyViolation: false };
    }
    if (this.rejections >= READ_ONLY_GUARD_MAX_REJECTIONS) {
      try {
        await git.reset(worktree, start);
      } catch (error) {
        this.options.warn?.('the worktree could not be reset', error);
      }
      return { kind: 'accept', readOnlyViolation: true };
    }
    this.rejections += 1;
    const listed = changes.slice(0, LISTED_CHANGES_MAX);
    const more = changes.length - listed.length;
    return {
      kind: 'reject',
      message: [
        'This is an analysis card: it must not change the repository. Changed:',
        ...listed.map((c) => `- ${c}`),
        ...(more > 0 ? [`- and ${more} more`] : []),
        'Undo your changes and call finish_analysis again.',
      ].join('\n'),
    };
  }
}
