import type { BoardCardView } from '@nautelle/shared';

/**
 * C-510 (ADR-0127): what a task card says. A task has no run pill, so the face
 * keeps one quiet line about the person, and the checklist as `2/4`.
 */

type TaskFace = Pick<
  BoardCardView,
  'column' | 'assignee' | 'checklist' | 'taskNote'
>;

/** Who the line is about; a task nobody holds reads "Unassigned". */
const who = (card: Pick<TaskFace, 'assignee'>) => card.assignee?.name ?? null;

/**
 * The face's one line: "Waiting on Anna" until she ticks something or the card
 * is moved to In progress, then "Anna is on it", and "Done by Anna" once it
 * is completed.
 */
export function taskLine(card: TaskFace): string {
  const name = who(card);
  if (card.column === 'completed') {
    return name ? `Done by ${name}` : 'Done';
  }
  if (!name) return 'Unassigned';
  const started =
    card.column === 'in_progress' || (card.checklist?.done ?? 0) > 0;
  return started ? `${name} is on it` : `Waiting on ${name}`;
}

/** The face's `2/4`; null for a task without a checklist. */
export const taskProgress = (
  card: Pick<TaskFace, 'checklist'>,
): string | null =>
  card.checklist && card.checklist.total > 0
    ? `${card.checklist.done}/${card.checklist.total}`
    : null;

/** Items still unticked; Done asks before it leaves them behind. */
export const unticked = (items: readonly { doneAt: string | null }[]): number =>
  items.filter((item) => item.doneAt === null).length;

/** What the Done confirmation says about the unticked items. */
export const doneConfirmText = (open: number): string =>
  `${open} checklist ${open === 1 ? 'item is' : 'items are'} not ticked. Mark the task done anyway? Anything waiting on it will be released.`;

/** A multi-line checklist field into items: trimmed, blank lines dropped. */
export const checklistLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
