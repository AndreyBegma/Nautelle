import { canAccept, canCollect } from '../board/card-actions';
import {
  canRetry,
  canRun,
  isFleetCard,
  isRoundActive,
} from '../board/card-rules';
import type { BoardCardView } from '../board/contracts';
import type { DesignRevisionView } from '../design/contracts';
import {
  INBOX_ITEM_KINDS,
  type InboxCardItem,
  type InboxFailedReason,
  type InboxItemKind,
  type InboxItemView,
  type InboxMergeItem,
  type InboxRetry,
} from './contracts';

/**
 * Which Inbox items a board card raises (C-390). Pure: the API reads the rows
 * and the card's view, and calls these; the web never re-derives them. A
 * `fleet` card's worker is the orchestrator's — its decisions stay on Fleet
 * and the Queue's approvals — so it raises none.
 */

const isOpen = (card: BoardCardView): boolean =>
  !isFleetCard(card) && card.column !== 'inbox' && card.column !== 'completed';

/** The card's running round shows a question screen (#489). */
export const waitsForAnswer = (card: BoardCardView): boolean =>
  isOpen(card) && card.round?.pendingQuestion != null;

/** The card's design has revisions to review and none is approved (#273). */
export const waitsForDesignApproval = (card: BoardCardView): boolean =>
  isOpen(card) &&
  card.design?.needed === true &&
  card.design.status === 'reviewing' &&
  card.design.approvedRevisionId === null;

/**
 * A Finished card at rest whose pull request is open: Merge is the next step.
 * A card that needs a person raises `failed` instead.
 */
export const waitsForMerge = (card: BoardCardView): boolean =>
  isOpen(card) &&
  canAccept(card) &&
  card.prNumber !== null &&
  card.prState === 'open' &&
  card.mergedAt === null &&
  !card.needsPerson &&
  card.collectState !== 'failed';

export interface InboxFailure {
  reason: InboxFailedReason;
  message: string | null;
  retry: InboxRetry;
  /** ISO; null when the card's own `updatedAt` is the best guess. */
  at: string | null;
}

const runRetry = (card: BoardCardView): InboxRetry =>
  canRun(card) || canRetry(card) ? 'run' : null;

/**
 * Why the card waits on a person, if it does. Nothing while a round is
 * active: a worker is already on it. `branch` is the card's branch, which the
 * card view leaves out; Retry collects only where Create pull request could.
 */
export const inboxFailureOf = (
  card: BoardCardView,
  branch: string | null,
): InboxFailure | null => {
  if (!isOpen(card) || isRoundActive(card.round)) return null;
  if (card.needsPerson) {
    return {
      reason: card.needsPersonReason ?? 'needs_person',
      message: null,
      retry: runRetry(card),
      at: null,
    };
  }
  if (card.collectState === 'failed') {
    return {
      reason: 'collect_failed',
      message: card.collectError,
      retry: canCollect({ ...card, branch }) ? 'collect' : null,
      at: null,
    };
  }
  if (card.column === 'in_progress' && card.round?.phase === 'failed') {
    return {
      reason: 'round_failed',
      message: null,
      retry: runRetry(card),
      at: null,
    };
  }
  if (card.autoRunFailure) {
    return {
      reason: 'auto_run_failed',
      message: card.autoRunFailure.message || null,
      retry: runRetry(card),
      at: card.autoRunFailure.at,
    };
  }
  return null;
};

export interface InboxCardContext {
  projectId: string;
  projectName: string;
  /** The card's branch (`board_cards.branch`). */
  branch: string | null;
  /** For `design`: what `InboxDesignItem.revisions` holds. */
  revisions: DesignRevisionView[];
  /** For `merge`: the card's newest demo. */
  demo: InboxMergeItem['demo'];
}

/** Every item `card` raises, in `INBOX_ITEM_KINDS` order. */
export const inboxCardItems = (
  card: BoardCardView,
  context: InboxCardContext,
): InboxCardItem[] => {
  const base = {
    projectId: context.projectId,
    projectName: context.projectName,
    card,
  };
  const items: InboxCardItem[] = [];
  if (waitsForDesignApproval(card)) {
    const newest = context.revisions.reduce<string | null>(
      (at, r) => (at === null || r.createdAt > at ? r.createdAt : at),
      null,
    );
    items.push({
      ...base,
      id: `design:${card.id}`,
      kind: 'design',
      since: newest ?? card.updatedAt,
      revisions: context.revisions,
    });
  }
  if (waitsForAnswer(card)) {
    items.push({
      ...base,
      id: `question:${card.id}`,
      kind: 'question',
      since: card.round?.waitingAt ?? card.updatedAt,
    });
  }
  if (waitsForMerge(card)) {
    items.push({
      ...base,
      id: `merge:${card.id}`,
      kind: 'merge',
      since: card.movedAt,
      demo: context.demo,
    });
  }
  const failure = inboxFailureOf(card, context.branch);
  if (failure) {
    items.push({
      ...base,
      id: `failed:${card.id}`,
      kind: 'failed',
      since: failure.at ?? card.updatedAt,
      reason: failure.reason,
      message: failure.message,
      retry: failure.retry,
    });
  }
  return items;
};

/** Oldest first; equal times keep a stable order by id. */
export const sortInboxItems = <T extends Pick<InboxItemView, 'since' | 'id'>>(
  items: readonly T[],
): T[] =>
  [...items].sort((a, b) =>
    a.since === b.since ? a.id.localeCompare(b.id) : a.since < b.since ? -1 : 1,
  );

/** Items of each kind. */
export const inboxCounts = (
  items: readonly Pick<InboxItemView, 'kind'>[],
): Record<InboxItemKind, number> => {
  const counts = Object.fromEntries(
    INBOX_ITEM_KINDS.map((kind) => [kind, 0]),
  ) as Record<InboxItemKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
};
