import { type BoardCardView, cardQueueText } from '@nautelle/shared';
import {
  quotaLimitText,
  quotaWaitText,
} from '../../components/board/quota-wait-line';
import {
  autoRunFailureText,
  blockingDialogText,
  collectFailedBadge,
  finishRefusedText,
  roundPill,
} from './format';
import { shippingBadge } from './shipping';

/**
 * C-392: the one state signal a board tile shows. Everything else the tile used
 * to stack as chips (cost, Saved, Steward, handoff, hooks, round pills, the
 * sub-states) lives in the card sheet; this picks the most urgent of them.
 */
export interface FaceState {
  status: 'running' | 'waiting' | 'blocked' | 'error' | 'idle';
  /** One or two words on the tile. */
  label: string;
  /** The detail the old chip carried: the tooltip and the accessible name. */
  title: string;
}

/**
 * The most urgent state of the card, or null when it has none to show:
 * failed, needs you, a question, running, in the run queue, waiting for a
 * slot; in that order.
 */
export function faceState(card: BoardCardView): FaceState | null {
  const round = card.round;
  const badge = shippingBadge(card);
  const notPushed = collectFailedBadge(card);

  if (round?.phase === 'failed') {
    return {
      status: 'error',
      label: 'Failed',
      title: 'The latest round failed',
    };
  }
  if (card.autoRunFailure) {
    return {
      status: 'error',
      label: 'Failed',
      title: `Didn’t start: ${autoRunFailureText(card.autoRunFailure)}`,
    };
  }
  if (notPushed) {
    return { status: 'error', label: 'Failed', title: notPushed.text };
  }
  if (card.steward?.status === 'escalated') {
    return {
      status: 'error',
      label: 'Failed',
      title: 'Steward could not fix this. Open the card for the history.',
    };
  }
  if (badge?.tone === 'danger') {
    return { status: 'blocked', label: 'Needs you', title: badge.label };
  }
  if (round?.finishRefused) {
    return {
      status: 'blocked',
      label: 'Needs you',
      title: finishRefusedText(round.finishRefused),
    };
  }
  if (card.protectedPaths.length > 0 && card.mergedAt === null) {
    return {
      status: 'blocked',
      label: 'Needs you',
      title: badge?.label ?? 'Protected paths changed; a person merges',
    };
  }
  if (round?.blockingDialog) {
    return {
      status: 'waiting',
      label: 'Question',
      title: blockingDialogText(round.blockingDialog),
    };
  }
  if (round?.phase === 'waiting') {
    return {
      status: 'waiting',
      label: 'Question',
      title: 'The worker waits for your answer',
    };
  }
  if (round?.quotaWait) {
    const wait = round.quotaWait;
    const title = `${quotaWaitText(wait)}. The session hit ${quotaLimitText(wait.limit)}.`;
    // No reset time: the runner will not resume the session, a person has to.
    if (wait.resetsAt === null) {
      return { status: 'blocked', label: 'Needs you', title };
    }
    return { status: 'idle', label: 'Usage limit', title };
  }
  const pill = roundPill(round);
  if (pill?.status === 'running') {
    return { status: 'running', label: pill.label, title: pill.label };
  }
  if (badge?.review) {
    return { status: 'running', label: 'In review', title: badge.label };
  }
  if (card.queue) {
    // C-398 (ADR-0100): in the run queue; it starts when a slot frees.
    return {
      status: 'idle',
      label: cardQueueText(card.queue),
      title:
        card.queue.stack !== null
          ? `Queued by Run stack S-${card.queue.stack}; Stop takes it out of the queue`
          : 'Starts when a slot frees; Stop takes it out of the queue',
    };
  }
  if (pill?.status === 'blocked' || pill?.status === 'idle') {
    return { status: pill.status, label: pill.label, title: pill.label };
  }
  return null;
}
