import type { PaneDialog } from '../protocol';
import { PLAN_TASK_MOVE_REFUSAL_TEXT } from '../work/contracts';
import {
  BOARD_ERROR,
  type BoardCardView,
  type BoardErrorCode,
  type CardRoundBrief,
} from './contracts';
import type { BoardMoveRefusal } from './moves';
import {
  type BoardColumn,
  type CardRoundPhase,
  isActiveRoundPhase,
} from './types';

/**
 * What a person may do with a card in its current state — the one set of
 * rules the web Board and the Telegram bot both offer buttons by. Pure: the
 * API still enforces every action on its own.
 */

type RuleCard = Pick<
  BoardCardView,
  'source' | 'tracking' | 'column' | 'round' | 'design' | 'queue'
> &
  Partial<Pick<BoardCardView, 'kind'>>;

/** C-398: the card waits in the run queue for a slot (or a dependency). */
export const isQueued = (card: RuleCard): boolean =>
  card.queue !== undefined && card.queue !== null;

export const isRoundActive = (round: RuleCard['round']): boolean =>
  isActiveRoundPhase(round?.phase);

/** #273 D7: the card's design is on and not approved, so the server would refuse Run. */
export const designBlocksRun = (card: RuleCard): boolean =>
  card.design?.needed === true && card.design.status !== 'approved';

export const isTerminalCard = (card: RuleCard): boolean =>
  card.source === 'terminal';

export const isFleetCard = (card: RuleCard): boolean => card.source === 'fleet';

/** #282 D1: the tracked terminal session is alive — it is the worker. */
export const isSessionAlive = (card: RuleCard): boolean =>
  card.tracking?.alive === true;

/**
 * #282 D1/D4: the board starts, stops and answers a worker only for a card
 * that owns one. A `fleet` card's worker is the orchestrator's; a `terminal`
 * card's is the person's own session while it lives. C-510: a `task` has no
 * worker at all — a person does it — so Run, Stop and the like are never
 * offered for it.
 */
export const ownsWorker = (card: RuleCard): boolean =>
  card.kind !== 'task' && !isFleetCard(card) && !isSessionAlive(card);

export const canRun = (card: RuleCard): boolean =>
  ownsWorker(card) &&
  (card.column === 'todo' || card.column === 'finished') &&
  !isRoundActive(card.round) &&
  !isQueued(card) &&
  !designBlocksRun(card);

/** A retry after a failed, ended or stopped round resumes the same session. */
export const canRetry = (card: RuleCard): boolean =>
  ownsWorker(card) &&
  card.column === 'in_progress' &&
  card.round !== null &&
  !isRoundActive(card.round) &&
  !designBlocksRun(card);

/** C-398: Stop on a card in the run queue takes it out of the queue. */
export const canStop = (card: RuleCard): boolean =>
  ownsWorker(card) && (isRoundActive(card.round) || isQueued(card));

/**
 * C-399 (ADR-0101): a hard budget paused the card's latest round. The retry
 * is its Resume: it continues the same session once the budget allows.
 */
export const isPausedForBudget = (card: RuleCard): boolean =>
  card.round?.phase === 'cancelled' && card.round.pausedFor === 'budget';

/** What the Run action reads for a card that can run or retry. */
export const runActionLabel = (card: RuleCard): string =>
  isPausedForBudget(card) ? 'Resume' : canRetry(card) ? 'Run again' : 'Run';

/** C-399: a round's state as a person reads it — a paused one says why. */
export const roundStateLabel = (
  round: Pick<CardRoundBrief, 'phase' | 'pausedFor'>,
): string =>
  round.phase === 'cancelled' && round.pausedFor === 'budget'
    ? 'Paused: budget'
    : ROUND_PHASE_LABEL[round.phase];

export const MOVE_REFUSAL_TEXT: Record<BoardMoveRefusal, string> = {
  card_running:
    'A worker is running on this card. Stop it first, or mark the card finished.',
  automatic_to_completed: 'Only a person completes a card.',
  card_completed: 'This card is already completed.',
  invalid_move: 'A suggestion leaves Suggestions only by Accept, into To Do.',
  plan_task_derived: PLAN_TASK_MOVE_REFUSAL_TEXT,
};

/** A round's phase as a person reads it. */
export const ROUND_PHASE_LABEL: Record<CardRoundPhase, string> = {
  queued: 'Queued',
  starting: 'Starting',
  running: 'Running',
  waiting: 'Waiting for you',
  // #390: the worker waits on its own background task, not on the person.
  background: 'Running in background',
  finished: 'Finished',
  ended: 'Ended',
  failed: 'Failed',
  cancelled: 'Stopped',
};

/**
 * #624: the Claude Code dialog that blocks a waiting round's session, as a
 * person reads it — the Board, notifications and Telegram say the same.
 */
export const BLOCKING_DIALOG_TEXT: Record<PaneDialog, string> = {
  trust: 'Claude Code’s workspace trust dialog',
  settings:
    'Claude Code’s workspace trust dialog (the folder pre-approves tool permissions)',
  bypass: 'Claude Code’s Bypass Permissions warning',
  credits: 'Claude Code’s usage credits notice',
  other: 'A Claude Code dialog',
};

/** #624: why a round blocked by `dialog` waits, and what to do. */
export const blockingDialogText = (dialog: PaneDialog): string =>
  `${BLOCKING_DIALOG_TEXT[dialog]} blocks the worker’s session. Open its terminal and answer it.`;

export const COLUMN_TITLE: Record<BoardColumn, string> = {
  inbox: 'Suggestions',
  todo: 'To Do',
  in_progress: 'In progress',
  finished: 'Finished',
  completed: 'Completed',
};

/**
 * The board's refusals that read the same wherever they are shown; a refusal
 * that needs more than its code (`move_refused`'s reason, a runner's name) is
 * worded by the surface that has it.
 */
export const BOARD_ACTION_ERROR_TEXT: Partial<Record<BoardErrorCode, string>> =
  {
    [BOARD_ERROR.cardRunning]:
      'A worker is running on this card. Stop it or mark it finished first.',
    [BOARD_ERROR.maxRunning]:
      'This project already runs its limit of workers. Wait for one to finish, or raise the limit in the project settings.',
    [BOARD_ERROR.budgetExceeded]:
      'A budget with a hard stop refuses another round.',
    [BOARD_ERROR.notRunning]: 'No worker is running on this card any more.',
    [BOARD_ERROR.wrongColumn]:
      'The card is not in the column this needs. Refresh the board.',
    [BOARD_ERROR.unsupportedRuntime]:
      'The runner refused: card workers run on Claude profiles only.',
    [BOARD_ERROR.designNotApproved]:
      'This card’s design is on and not approved yet. Open the design and approve it, or approve and run from there.',
    [BOARD_ERROR.invalidMove]: MOVE_REFUSAL_TEXT.invalid_move,
    [BOARD_ERROR.dependencyOpen]:
      'A card it depends on has no ready pull request yet.',
    [BOARD_ERROR.dependenciesUnmerged]:
      'More than one card it depends on is not merged yet; it branches from one only.',
  };
