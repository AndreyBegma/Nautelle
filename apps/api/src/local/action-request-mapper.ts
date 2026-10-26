import {
  type ActionRequestKind,
  type ActionRequestSummary,
  boundPrOf,
  type CardAcceptBoundArgs,
  cardAcceptArgsOf,
  cardLabel,
  issueQueueArgsOf,
  type PrApproveBoundArgs,
  prDiffUrl,
  shortHeadSha,
  toolUseRememberOf,
} from '@nautelle/shared';
import type { ActionRequest } from '@prisma/client';

/**
 * Live event on topic `project:<id>` whenever an action request is created
 * or changes status (spec 201 "API"); clients refetch the list on it, as
 * they do on `approvals`.
 */
export const ACTION_REQUESTS_LIVE_EVENT = 'action_requests';

export interface ActionRequestsLiveChange {
  kind: 'action_requests';
  projectId: string;
  id: string;
  status: ActionRequestSummary['status'];
}

/** A request as the web lists it: the shared summary plus its PR. */
export interface ActionRequestView extends ActionRequestSummary {
  /**
   * A `pr_approve` request's PR as `pr.inspect` read it at creation — the
   * head an approval binds to — with its diff; null for any other kind.
   */
  pr: (PrApproveBoundArgs & { diffUrl: string }) | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArgs = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

export const toActionRequestSummary = (
  row: ActionRequest,
): ActionRequestSummary => ({
  id: row.id,
  projectId: row.projectId,
  runnerId: row.runnerId,
  sessionId: row.sessionId,
  requestedById: row.requestedById,
  kind: row.kind,
  summary: row.summary,
  args: asArgs(row.args),
  status: row.status,
  decidedById: row.decidedById,
  decidedAt: row.decidedAt?.toISOString() ?? null,
  note: row.note,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  ruleId: row.ruleId,
  remember: toolUseRememberOf(row),
  // C-416: the session reads why an approval failed (`head_moved` and the new head).
  result: isRecord(row.result) ? row.result : null,
});

export const toActionRequestView = (row: ActionRequest): ActionRequestView => {
  const pr = boundPrOf(row);
  return {
    ...toActionRequestSummary(row),
    pr: pr ? { ...pr, diffUrl: prDiffUrl(pr) } : null,
  };
};

const KIND_TITLE: Record<ActionRequestKind, string> = {
  tool_use: 'A session asks to use a tool',
  orchestrator_start: 'A session asks to start the orchestrator',
  orchestrator_stop: 'A session asks to stop the orchestrator',
  pr_approve: 'A session asks to approve a PR',
  issue_queue: 'A session asks to queue an issue for the fleet',
  card_accept: 'A session asks to accept a card',
};

/** The notification's title (spec 22 D10: no prompt or code text). */
export const actionRequestTitle = (
  kind: ActionRequestKind,
  args: Record<string, unknown>,
): string => {
  if (kind === 'tool_use' && typeof args.toolName === 'string') {
    return `A session asks to use ${args.toolName.slice(0, 80)}`;
  }
  if (kind === 'pr_approve' && typeof args.pr === 'number') {
    const head =
      typeof args.headSha === 'string'
        ? ` at ${shortHeadSha(args.headSha)}`
        : '';
    return `A session asks to approve PR #${args.pr}${head}`;
  }
  if (kind === 'issue_queue' && typeof args.issue === 'number') {
    return `A session asks to queue issue #${args.issue} for the fleet`;
  }
  // #845: "Accept C-<n> <title>", the card as the API bound it.
  const card = cardAcceptArgsOf({ kind, args });
  if (card) {
    return `Accept ${cardLabel(card.card)} ${card.title.slice(0, 120)}`;
  }
  return KIND_TITLE[kind];
};

/**
 * #845: a `card_accept` request's pull request link, and "and merge #<pr>"
 * when the approval also merges it — "at <sha7>" when the head is bound
 * (C-416), with the diff the approver reviews instead of the bare link.
 */
export const cardAcceptLines = (card: CardAcceptBoundArgs): string[] => {
  const merges = card.merge === true && card.prNumber !== null;
  const head = merges && card.headSha ? card.headSha : null;
  const link =
    card.prUrl && head
      ? prDiffUrl({ url: card.prUrl, headSha: head })
      : card.prUrl;
  return [
    ...(link ? [link] : []),
    ...(merges
      ? [
          `and merge #${card.prNumber}${head ? ` at ${shortHeadSha(head)}` : ''}`,
        ]
      : []),
  ];
};

/**
 * The notification's body: a `pr_approve` request's PR title and diff come
 * first, so the person sees what the head they approve holds; an
 * `issue_queue` request's issue title and link, so they can read it first.
 */
export const actionRequestBody = (
  kind: ActionRequestKind,
  args: Record<string, unknown>,
  summary: string,
): string => {
  const pr = boundPrOf({ kind, args });
  if (pr) return `${pr.title.slice(0, 120)} · ${prDiffUrl(pr)} · ${summary}`;
  const issue = issueQueueArgsOf({ kind, args });
  if (issue)
    return `#${issue.issue} ${issue.title.slice(0, 120)} · ${issue.url} · ${summary}`;
  const card = cardAcceptArgsOf({ kind, args });
  if (card) return [...cardAcceptLines(card), summary].join(' · ');
  return summary;
};

/**
 * The notification's link: the Inbox filtered to permissions, where a request
 * is decided (C-469, ADR-0106). It also carries the request's id back to the
 * Telegram buttons: a notification row has no other reference to it. The
 * Inbox spans projects, so the link names none.
 */
export const actionRequestLink = (_projectId: string, id: string): string =>
  `/inbox?kind=permission&actionRequest=${encodeURIComponent(id)}`;

/**
 * The Inbox form, and the two older ones that stored rows still hold: the
 * Queue's Approvals tab (C-284) and the pre-C-284 `/approvals` page.
 */
const LINK =
  /^(?:\/inbox\?kind=permission&|\/projects\/[^/?]+\/(?:queue\?tab=approvals&|approvals\?))actionRequest=([A-Za-z0-9_-]{1,64})$/;

/** The request id of an `action.requested` notification's link; null otherwise. */
export const actionRequestIdOfLink = (link: string | null): string | null => {
  const match = link ? LINK.exec(link) : null;
  return match ? match[1] : null;
};
