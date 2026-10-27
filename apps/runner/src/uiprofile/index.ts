import type {
  CommandArgs,
  CommandResult,
  UiProfileCommandName,
} from '@nautelle/shared/protocol';
import { withSignal } from '../detect/exec';
import type { SkillsDeps } from '../skills/deps';
import type { UiProfileBuildExecutor } from './executor';
import { fingerprint } from './fingerprint';

export {
  UIPROFILE_TICK_MS,
  UiProfileBuildExecutor,
  type UiProfileExecutorOptions,
} from './executor';
export { UiProfileLearner, type UiProfileLearnerOptions } from './learn';

/** The `uiprofile.*` handlers (docs/specs/223-design-stage.md "Protocol"). */
export type UiProfileHandlers = {
  [N in UiProfileCommandName]: (
    args: CommandArgs<N>,
    signal?: AbortSignal,
  ) => Promise<CommandResult<N>> | CommandResult<N>;
};

export const createUiProfileHandlers = (
  deps: Pick<SkillsDeps, 'exec' | 'watchedProjects'>,
  executor: UiProfileBuildExecutor,
): UiProfileHandlers => ({
  'uiprofile.build': (args) => executor.run(args),
  'uiprofile.fingerprint': (args, signal) =>
    fingerprint(args, { ...deps, exec: withSignal(deps.exec, signal) }),
  'uiprofile.cancel': (args) => executor.cancel(args),
  'uiprofile.learn': (args) => executor.learner.learn(args),
});
