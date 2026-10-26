import { ownsWorker } from './card-rules';
import type { BoardCardView } from './contracts';
import { isActiveRoundPhase } from './types';

/**
 * C-473 (ADR-0122): which cards Fleet's Working now lists — the one
 * definition of "at work" the API filters by and the web draws rows from.
 * Pure, like the other card rules.
 */

type WorkingCard = Pick<
  BoardCardView,
  | 'source'
  | 'column'
  | 'round'
  | 'design'
  | 'fleet'
  | 'tracking'
  | 'taken'
  | 'queue'
>;

/** An active round on the card's own worker (not a slot's, not a session's). */
export const worksOnOwnWorker = (card: WorkingCard): boolean =>
  ownsWorker(card) && isActiveRoundPhase(card.round?.phase);

/** An orchestrator slot that still holds the card, until it is completed. */
export const hasLiveSlot = (card: WorkingCard): boolean =>
  card.fleet?.slot != null &&
  !card.fleet.slotGone &&
  card.column !== 'completed';

/** A live tracked terminal session, or a live session that took the card. */
export const hasLiveSession = (card: WorkingCard): boolean =>
  card.tracking?.alive === true || card.taken?.alive === true;

/** C-398: a To Do card's place in the run queue. */
export const waitsInRunQueue = (card: WorkingCard): boolean =>
  card.queue != null && card.column === 'todo';

/**
 * A card Working now shows: out of the Inbox, and worked by at least one
 * hand. Inbox suggestions are never listed, whoever asks.
 */
export const isWorkingCard = (card: WorkingCard): boolean =>
  card.column !== 'inbox' &&
  (worksOnOwnWorker(card) ||
    hasLiveSlot(card) ||
    hasLiveSession(card) ||
    waitsInRunQueue(card));

/** `GET /projects/:projectId/fleet/working`: the cards at work, as the Board maps them. */
export interface FleetWorkingView {
  projectId: string;
  cards: BoardCardView[];
}
