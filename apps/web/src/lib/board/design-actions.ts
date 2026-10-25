import type { BoardCardView } from '@nautelle/shared';

/**
 * A card's design on the board (#243). Approving with "Continue after design"
 * on starts the worker on the server (D5); with it off the person decides, and
 * the viewer offers **Approve & run** (D6).
 */

/** The two requests **Approve & run** is made of. */
export interface ApproveAndRunSteps {
  approve: (revisionId: string) => Promise<unknown>;
  run: () => Promise<unknown>;
}

/**
 * Approve, then Run. Run is only sent once the approval went through: a
 * refused approval (budget, `design_busy`) throws before it, and a refused Run
 * (`max_running`) leaves the design approved — the card waits in To Do.
 */
export async function approveAndRun(
  steps: ApproveAndRunSteps,
  revisionId: string,
): Promise<void> {
  await steps.approve(revisionId);
  await steps.run();
}

/** The two requests **Back with comment** is made of (C-394). */
export interface BackWithCommentSteps {
  comment: (revisionId: string, body: string) => Promise<unknown>;
  revise: () => Promise<unknown>;
}

/**
 * Leave the comment on the revision, then start the revise turn, which
 * passes every open comment. Revise is only sent once the comment is saved;
 * a refused Revise leaves the comment open for the next try.
 */
export async function backWithComment(
  steps: BackWithCommentSteps,
  revisionId: string,
  body: string,
): Promise<void> {
  const text = body.trim();
  if (text === '') throw new Error('A comment is required.');
  await steps.comment(revisionId, text);
  await steps.revise();
}

/** Whether the viewer offers Approve & run: the switch is off, so nothing starts by itself. */
export const offersApproveAndRun = (
  card: Pick<BoardCardView, 'continueAfterDesign'>,
): boolean => !card.continueAfterDesign;

/** What the approve dialog says happens next. */
export function approveConsequence(continueAfterDesign: boolean): string {
  return continueAfterDesign
    ? 'The worker starts after approval, with the approved mockup committed into the card’s branch.'
    : 'The card waits in To Do with “Design approved”; the approved mockup goes into the card’s branch when you press Run.';
}
