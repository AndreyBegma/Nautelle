import { type BoardCardView, isQueued, isRoundActive } from '@nautelle/shared';

/**
 * C-398 (ADR-0100): Stop on a card waiting in the run queue only takes it out
 * of the queue — there is no worker to stop.
 */
export const stopLeavesQueue = (card: BoardCardView): boolean =>
  isQueued(card) && !isRoundActive(card.round);

/** A card action that waits for its confirmation dialog. */
export type CardConfirmation =
  | { kind: 'stop' | 'delete'; card: BoardCardView }
  /** C-166: one Inbox card; `onDone` runs once it is gone (the sheet closes). */
  | { kind: 'dismiss'; card: BoardCardView; onDone?: () => void }
  | { kind: 'dismiss-all'; count: number };

export function cardConfirmCopy(pending: CardConfirmation): {
  title: string;
  consequence: string;
  verb: string;
} {
  switch (pending.kind) {
    case 'dismiss-all':
      return {
        title:
          pending.count === 1
            ? 'Dismiss the suggestion?'
            : `Dismiss all ${pending.count} suggestions?`,
        consequence:
          'The cards are deleted. Nautelle remembers their titles for 90 days so the same suggestion does not come back.',
        verb: 'Dismiss all',
      };
    case 'dismiss':
      return {
        title: `Dismiss ${pending.card.label}?`,
        consequence:
          'The card is deleted. Nautelle remembers its title for 90 days so the same suggestion does not come back.',
        verb: 'Dismiss',
      };
    case 'stop':
      if (stopLeavesQueue(pending.card)) {
        return {
          title: `Take ${pending.card.label} out of the run queue?`,
          consequence:
            'The card stays in To Do and does not start when a slot frees; you can run it again.',
          verb: 'Remove from queue',
        };
      }
      return {
        title: `Stop the worker of ${pending.card.label}?`,
        consequence:
          'The tmux session is killed. The work already committed in the worktree stays; you can run the card again.',
        verb: 'Stop worker',
      };
    case 'delete':
      return {
        title: `Delete ${pending.card.label}?`,
        consequence:
          'The card and its rounds are removed, and its worktree is cleaned up. A pull request it opened stays on GitHub.',
        verb: 'Delete',
      };
  }
}
