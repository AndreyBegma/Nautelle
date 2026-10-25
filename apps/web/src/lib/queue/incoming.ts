import {
  BOARD_CARD_TITLE_MAX,
  type CreateBoardCardRequest,
  type QueueView,
} from '@nautelle/shared';

/**
 * C-397 (ADR-0098): Queue is incoming work — the project's open GitHub issues,
 * each one a card away from being worked. `labelled` is the issues carrying
 * the ready label (the orchestrator's queue); `all` adds every other open one.
 */
export type IncomingScope = 'labelled' | 'all';

export const INCOMING_SCOPE_LABEL: Record<IncomingScope, string> = {
  labelled: 'Labelled',
  all: 'All open',
};

export interface IncomingIssue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  /** Carries the ready label, so the orchestrator may pick it up too. */
  ready: boolean;
  /** The card that works it; null offers Make a card. */
  cardNumber: number | null;
}

/** Labelled issues first, then the others; each newest number first. */
export function incomingIssues(
  view: QueueView,
  scope: IncomingScope,
): IncomingIssue[] {
  const byNumber = (a: IncomingIssue, b: IncomingIssue) => b.number - a.number;
  const labelled = view.items
    .map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
      labels: item.labels,
      ready: true,
      cardNumber: item.cardNumber ?? null,
    }))
    .sort(byNumber);
  if (scope === 'labelled') return labelled;
  const others = (view.others ?? [])
    .map((other) => ({
      number: other.number,
      title: other.title,
      url: other.url,
      labels: other.labels,
      ready: false,
      cardNumber: other.cardNumber ?? null,
    }))
    .sort(byNumber);
  return [...labelled, ...others];
}

/** Make a card: a card linked to the issue, titled after it (C-397). */
export const makeCardRequest = (
  issue: Pick<IncomingIssue, 'number' | 'title'>,
): CreateBoardCardRequest => ({
  title:
    issue.title.trim().slice(0, BOARD_CARD_TITLE_MAX) || `#${issue.number}`,
  issueNumber: issue.number,
});
