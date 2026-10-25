import type { BoardCardView } from '@nautelle/shared';
import { approveRunOffer, describeBoardError } from './format';

/**
 * A card's design on the board (#243). Approving with "Continue after design"
 * on starts the worker on the server (D5); with it off the person decides, and
 * the viewer offers **Approve & run** (D6).
 */

/** The two requests **Approve & run** is made of. */
export interface ApproveAndRunSteps {
  approve: (revisionId: string) => Promise<unknown>;
  /** Run answers with the card; `queue` is set when the Board is full (C-398). */
  run: () => Promise<Pick<BoardCardView, 'queue'>>;
}

/**
 * Approve, then Run. Run is only sent once the approval went through: a
 * refused approval (budget, `design_busy`) throws before it, and a refused Run
 * leaves the design approved — the card waits in To Do. Resolves to whether
 * the card was queued for a slot instead of started (C-398, ADR-0102).
 */
export async function approveAndRun(
  steps: ApproveAndRunSteps,
  revisionId: string,
): Promise<boolean> {
  await steps.approve(revisionId);
  const done = await steps.run();
  return Boolean(done.queue);
}

/** Where the toasts of **Approve & run** go. */
export interface ApproveAndRunNotify {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * **Approve & run** with its toasts, shared by the card sheet, the stack page
 * and the full-screen viewer. A refused approval is rethrown untoasted (the
 * design hook already toasted it, and the caller decides whether its dialog
 * stays); a refused Run is toasted here, since the approval stands.
 */
export async function approveAndRunCard(
  steps: ApproveAndRunSteps,
  revisionId: string,
  label: string,
  notify: ApproveAndRunNotify,
): Promise<void> {
  let approved = false;
  try {
    const queued = await approveAndRun(
      {
        approve: async (id) => {
          await steps.approve(id);
          approved = true;
        },
        run: steps.run,
      },
      revisionId,
    );
    notify.success(
      queued
        ? `Approved. ${label} is waiting for a slot.`
        : `Approved. Started a worker on ${label}.`,
    );
  } catch (error) {
    if (!approved) throw error;
    notify.error(describeBoardError(error));
  }
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

/**
 * Whether the card sheet's in-place review offers Approve & run (C-394): the
 * switch is off and the card could start now — the same gate as the sheet
 * header's offer, so a fleet card, a card with a live session or a running
 * round gets Approve only.
 */
export const offersInPlaceApproveAndRun = (card: BoardCardView): boolean =>
  offersApproveAndRun(card) && approveRunOffer(card)?.enabled === true;

/** What the approve dialog says happens next. */
export function approveConsequence(continueAfterDesign: boolean): string {
  return continueAfterDesign
    ? 'The worker starts after approval, with the approved mockup committed into the card’s branch.'
    : 'The card waits in To Do with “Design approved”; the approved mockup goes into the card’s branch when you press Run.';
}
