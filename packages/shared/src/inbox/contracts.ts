import type { ActionRequestSummary } from '../action-requests/contracts';
import type { BoardCardView } from '../board/contracts';
import type { CardNeedsPersonReason } from '../board/types';
import type { DemoStatus } from '../demos/contracts';
import type { DesignRevisionView } from '../design/contracts';
import type { ReadinessBlocker } from '../readiness/readiness';

/**
 * The Inbox (C-390, ADR-0103): one workspace page with everything that waits
 * for a decision of the caller, across every project where they are operator
 * or higher, each with its action. `GET /inbox` builds it on the server, so
 * the page, the rail badge and Overview's preview count the same items.
 *
 * Not the Board's `inbox` column — that holds captured suggestions (#244);
 * every name here says "inbox item" to keep the two apart.
 */

/**
 * - `design` — a card design waiting for approval;
 * - `question` — a card session's question screen;
 * - `merge` — a Finished card whose open pull request waits for Merge;
 * - `failed` — a card that needs a person: CI fix rounds exhausted, a failed
 *   collect (nothing could be pushed), a failed round or auto-run;
 * - `permission` — a pending action request (tool use and the rest of D18);
 * - `setup` — a project blocker that stops its cards from running.
 */
export const INBOX_ITEM_KINDS = [
  'design',
  'question',
  'merge',
  'failed',
  'permission',
  'setup',
] as const;
export type InboxItemKind = (typeof INBOX_ITEM_KINDS)[number];

export const isInboxItemKind = (value: string): value is InboxItemKind =>
  (INBOX_ITEM_KINDS as readonly string[]).includes(value);

/** The kinds a board card raises; the rest come from requests and readiness. */
export type InboxCardItemKind = Extract<
  InboxItemKind,
  'design' | 'question' | 'merge' | 'failed'
>;

/**
 * Why a `failed` item waits: the card's `needsPersonReason` (`needs_person`
 * when it is unknown), or `collect_failed` (its work could not be pushed),
 * `round_failed` (the latest round failed in In progress) or
 * `auto_run_failed` (an automatic run was refused).
 */
export type InboxFailedReason =
  | CardNeedsPersonReason
  | 'needs_person'
  | 'collect_failed'
  | 'round_failed'
  | 'auto_run_failed';

/** What Retry on a `failed` item does: run the card again, collect it again, or nothing. */
export type InboxRetry = 'run' | 'collect' | null;

interface InboxItemBase {
  /** Stable across reads: `<kind>:<card, request or project id>[:<code>]`. */
  id: string;
  kind: InboxItemKind;
  projectId: string;
  projectName: string;
  /** Since when it waits (ISO); the list is oldest first. */
  since: string;
}

/** The items a board card raises carry the card as the Board shows it. */
interface InboxCardItemBase extends InboxItemBase {
  card: BoardCardView;
}

export interface InboxQuestionItem extends InboxCardItemBase {
  kind: 'question';
}

/**
 * `demo` is the card's newest recording; `contentUrl` (through the web's
 * `/api` rewrite) only while it is `ready`.
 */
export interface InboxMergeItem extends InboxCardItemBase {
  kind: 'merge';
  demo: {
    status: DemoStatus;
    contentUrl: string | null;
    durationMs: number | null;
  } | null;
}

/**
 * The newest revision of each variant not archived, in variant order — what
 * Approve picks from. Empty while the revisions are still unread.
 */
export interface InboxDesignItem extends InboxCardItemBase {
  kind: 'design';
  revisions: DesignRevisionView[];
}

export interface InboxFailedItem extends InboxCardItemBase {
  kind: 'failed';
  reason: InboxFailedReason;
  /** The error or refusal as the API recorded it; null when there is none. */
  message: string | null;
  retry: InboxRetry;
}

/** Only requests the caller may decide (`mayDecideActionRequest`). */
export interface InboxPermissionItem extends InboxItemBase {
  kind: 'permission';
  request: ActionRequestSummary;
}

/** A Run blocker of a project that has open cards. */
export interface InboxSetupItem extends InboxItemBase {
  kind: 'setup';
  blocker: ReadinessBlocker;
}

export type InboxCardItem =
  | InboxQuestionItem
  | InboxMergeItem
  | InboxDesignItem
  | InboxFailedItem;

export type InboxItemView =
  | InboxCardItem
  | InboxPermissionItem
  | InboxSetupItem;

/** A project the Inbox could not read; the rest of the list still loads. */
export interface InboxMissingProject {
  projectId: string;
  projectName: string;
  message: string;
}

/** `GET /inbox`. */
export interface InboxView {
  /** Oldest first. */
  items: InboxItemView[];
  /** Items of each kind; `total` is their sum. */
  counts: Record<InboxItemKind, number>;
  total: number;
  /** The projects it read — operator or higher — by name. */
  projects: { id: string; name: string }[];
  missing: InboxMissingProject[];
}
