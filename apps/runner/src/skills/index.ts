import type {
  CommandArgs,
  CommandResult,
  SkillCommandName,
} from '@nautelle/shared/protocol';
import { withSignal } from '../detect/exec';
import { SkillCatalog } from './catalog';
import type { SkillsDeps } from './deps';
import { inspectSkills, installSkill, uninstallSkill } from './install';
import { listSkills } from './inventory';
import type { SkillRunExecutor } from './run/executor';

export type { SkillsDeps } from './deps';
export { type ExecutorOptions, SkillRunExecutor } from './run/executor';
export { RunLogStreamer } from './run/log';

/** The seven `skill.*` handlers (spec 24). */
export type SkillHandlers = {
  [N in SkillCommandName]: (
    args: CommandArgs<N>,
    signal?: AbortSignal,
  ) => Promise<CommandResult<N>> | CommandResult<N>;
};

export const createSkillHandlers = (
  deps: SkillsDeps & { fetch: typeof fetch },
  executor: SkillRunExecutor,
): SkillHandlers => {
  const catalog = new SkillCatalog({ fetch: deps.fetch, clock: deps.clock });
  // #754 D2: whatever these spawn dies with the command.
  const bound = (signal?: AbortSignal) => ({
    ...deps,
    exec: withSignal(deps.exec, signal),
  });
  return {
    'skill.search': (args) => catalog.search(args),
    'skill.inspect': (args, signal) => inspectSkills(args, bound(signal)),
    'skill.install': (args, signal) => installSkill(args, { ...deps, signal }),
    'skill.uninstall': (args) => uninstallSkill(args, deps),
    'skill.list': (args, signal) => listSkills(args, bound(signal)),
    'skill.run': (args) => executor.run(args),
    'skill.cancel': (args) => executor.cancel(args),
  };
};
