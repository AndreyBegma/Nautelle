import type { CommandErrorCode } from '@nautelle/shared/protocol';

/**
 * Thrown by a handler to answer with a specific error code instead of
 * `internal`. `message` is sent to the server as is. `timeout` is a handler
 * that stops between steps because its signal aborted (#754 D3).
 */
export class CommandFailure extends Error {
  constructor(
    readonly code: Exclude<CommandErrorCode, 'internal'>,
    message: string,
  ) {
    super(message);
  }
}

/**
 * #754 D3: a multi-step handler calls this before a step that must not run
 * once the command timed out — the dispatcher has already answered.
 */
export const stopIfAborted = (
  signal: AbortSignal | undefined,
  next: string,
): void => {
  if (signal?.aborted) {
    throw new CommandFailure('timeout', `timed out before ${next}`);
  }
};
