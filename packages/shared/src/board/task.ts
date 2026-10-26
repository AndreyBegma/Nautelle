import type { Role } from '../auth';
import { projectRoleAtLeast } from '../projects/contracts';
import type { BoardCardKind, RunnableCardKind } from './types';

/**
 * C-509 (ADR-0127): a `task` card is work a person does — "add the secret",
 * "approve the DNS change". It has an assignee, an optional checklist and a
 * Done action; no session, runner, pull request or demo. Done moves it to
 * Completed, which satisfies its dependants like any completed card.
 */

/** Checklist items one task may hold. */
export const TASK_CHECKLIST_MAX = 30;
/** One checklist item's text. */
export const TASK_CHECKLIST_TEXT_MAX = 200;
/** The note a person may leave on Done. */
export const TASK_NOTE_MAX = 2_000;

export const isTaskCard = (card: { kind: BoardCardKind }): boolean =>
  card.kind === 'task';

/** The cards a runner works — every card but a task. */
export const isRunnableCard = <T extends { kind: BoardCardKind }>(
  card: T,
): card is T & { kind: RunnableCardKind } => card.kind !== 'task';

/**
 * D5: who may Done, Reopen or tick the checklist of a task — an operator or
 * above, or the task's assignee whatever their role, so a viewer can finish
 * the work handed to them.
 */
export const mayActOnTask = (
  role: Role,
  userId: string,
  card: { assigneeId: string | null },
): boolean =>
  projectRoleAtLeast(role, 'operator') ||
  (card.assigneeId !== null && card.assigneeId === userId);
