import {
  BOARD_ERROR,
  type BoardCardKind,
  type BoardErrorBody,
  type BoardErrorCode,
  type CardAutoRunFailure,
  cardLabel,
  isCardAutoRunCode,
  type RunnableCardKind,
} from '@nautelle/shared';
import { HttpException } from '@nestjs/common';

/**
 * A refusal's details beside its message: `reason`, `no_profile`'s source and
 * key (#272 D2), `dependency_open`'s open dependencies (#337 D8), and
 * `stack_refused`'s cards that cannot join (#588), and `merge_failed`'s current
 * head and its diff (C-415).
 */
type BoardErrorExtra = Pick<
  BoardErrorBody,
  | 'reason'
  | 'source'
  | 'profileKey'
  | 'dependencies'
  | 'cards'
  | 'headSha'
  | 'diffUrl'
>;

/**
 * An HTTP error of the board routes, shaped like every other API error. Its
 * `code` lets a caller audit the refusal before rethrowing it.
 */
export class BoardFailure extends HttpException {
  constructor(
    readonly statusCode: number,
    readonly code: BoardErrorCode,
    message: string,
    extra: BoardErrorExtra = {},
  ) {
    const body: BoardErrorBody = {
      statusCode,
      error: code,
      message,
      ...extra,
    };
    super(body, statusCode);
  }
}

export const boardError = (
  statusCode: number,
  code: BoardErrorCode,
  message: string,
  extra: BoardErrorExtra = {},
): BoardFailure => new BoardFailure(statusCode, code, message, extra);

export const cardNotFound = (): BoardFailure =>
  boardError(404, 'not_found', 'Card not found');

/**
 * C-509 (ADR-0127): a task card has no session, runner, pull request or demo,
 * so every piece of runner work on one is refused `card_is_task`. `what` names
 * the refused work for the message.
 */
export function assertNotTask<
  T extends { kind: BoardCardKind; number: number },
>(card: T, what: string): asserts card is T & { kind: RunnableCardKind } {
  if (card.kind !== 'task') return;
  throw boardError(
    409,
    BOARD_ERROR.cardIsTask,
    `${cardLabel(card.number)} is a task: a person does it, so it has no ${what}`,
  );
}

/** #273 D8: `CardAutoRunFailure.message` is at most this many characters. */
const AUTO_RUN_MESSAGE_MAX = 500;

/**
 * #273 D8, #443: why an automatic start was refused — the refusal's `error`
 * when it is a board code (`max_running`, `budget_exceeded`,
 * `command_unavailable`, …), else `unknown`, with its message: what a
 * manual Run in that state is told.
 */
export const autoRunFailureOf = (
  error: unknown,
): { code: CardAutoRunFailure['code']; message: string } => {
  const body = error instanceof HttpException ? error.getResponse() : null;
  const code =
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string' &&
    isCardAutoRunCode(body.error)
      ? body.error
      : 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message: message.slice(0, AUTO_RUN_MESSAGE_MAX) };
};
