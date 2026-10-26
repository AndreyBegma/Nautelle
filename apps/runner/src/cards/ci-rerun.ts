import type {
  CardCiRerunArgs,
  CardCiRerunResult,
  WatchedProject,
} from '@nautelle/shared/protocol';
import { z } from 'zod';
import { watchedProject } from '../control/target';
import type { Exec } from '../detect/exec';
import { redactUrlUserinfo } from '../redact-url';
import { githubOf } from '../skills/run/collect';
import { firstLine, ghOf, parsed } from './github';

export interface CardCiRerunDeps {
  exec: Exec;
  watchedProjects: () => readonly WatchedProject[];
}

const prViewSchema = z.looseObject({
  state: z.string(),
  headRefOid: z.string(),
});

/**
 * C-414 (ADR-0114, ADR-0010): re-runs the failed jobs of a red card PR's
 * GitHub Actions runs once — `gh pr view`, then `gh run rerun <id> --failed`
 * per run, argument arrays only. Only an open PR whose head is still
 * `headSha` is touched. Every run is tried; the first that `gh` refuses is
 * the answer. A refusal is a result, never a thrown command error, except for
 * a target that is not a watched project.
 */
export const rerunCardCi = async (
  args: CardCiRerunArgs,
  deps: CardCiRerunDeps,
): Promise<CardCiRerunResult> => {
  const project = watchedProject(args, deps.watchedProjects());
  const gh = ghOf(deps.exec);
  const pr = String(args.pr);
  let github: string;
  try {
    github = await githubOf(deps, project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      rerun: false,
      error: 'gh_failed',
      message: redactUrlUserinfo((message.split('\n')[0] ?? '').slice(0, 500)),
    };
  }
  const viewed = await gh([
    'pr',
    'view',
    pr,
    '--repo',
    github,
    '--json',
    'state,headRefOid',
  ]);
  const view = viewed?.code === 0 ? parsed(prViewSchema, viewed.stdout) : null;
  if (!view) {
    return { rerun: false, error: 'gh_failed', message: firstLine(viewed) };
  }
  if (view.state !== 'OPEN') {
    return {
      rerun: false,
      error: 'not_open',
      message: `pull request #${pr} is ${view.state.toLowerCase()}`,
    };
  }
  if (view.headRefOid !== args.headSha) {
    return {
      rerun: false,
      error: 'head_moved',
      message: `pull request #${pr} moved on to ${view.headRefOid.slice(0, 12)}`,
    };
  }
  let refused: string | null = null;
  for (const id of args.runIds) {
    const rerun = await gh([
      'run',
      'rerun',
      String(id),
      '--failed',
      '--repo',
      github,
    ]);
    if (rerun?.code !== 0 && refused === null) {
      refused = `run ${id}: ${firstLine(rerun)}`.slice(0, 500);
    }
  }
  return refused === null
    ? { rerun: true }
    : { rerun: false, error: 'gh_failed', message: refused };
};
