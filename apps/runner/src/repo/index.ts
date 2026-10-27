import type {
  CommandArgs,
  CommandResult,
  RepoCommandName,
} from '@nautelle/shared/protocol';
import { withSignal } from '../detect/exec';
import type { CodeAsker } from './ask';
import { repoRead } from './read';
import { repoSearch } from './search';
import type { RepoDeps } from './types';

export { CodeAsker } from './ask';

/** `repo.search`, `repo.read` and `code.ask` (#622, ADR-0063). */
export type RepoHandlers = {
  [N in RepoCommandName]: (
    args: CommandArgs<N>,
    signal?: AbortSignal,
  ) => Promise<CommandResult<N>>;
};

export const createRepoHandlers = (
  deps: RepoDeps,
  asker: CodeAsker,
): RepoHandlers => ({
  // #754 D2: `git grep` / `git ls-files` die with the command.
  'repo.search': (args, signal) =>
    repoSearch(args, { ...deps, exec: withSignal(deps.exec, signal) }),
  'repo.read': (args, signal) =>
    repoRead(args, { ...deps, exec: withSignal(deps.exec, signal) }),
  'code.ask': (args) => asker.ask(args),
});
