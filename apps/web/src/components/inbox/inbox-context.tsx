'use client';

import {
  BOARD_CHANGED_EVENT,
  CARD_FINISHED_EVENT,
  CARD_WAITING_EVENT,
  DESIGN_LIVE_EVENT,
  INBOX_ITEM_KINDS,
  type InboxItemKind,
  type InboxView,
} from '@nautelle/shared';
import { createContext, useContext } from 'react';
import { api } from '../../lib/api';
import { ACTION_REQUESTS_LIVE_EVENT } from '../../lib/approvals/action-requests';
import { useLiveRefresh } from '../../lib/live/use-live-refresh';
import { type Section, useSection } from '../../lib/section/use-section';

/**
 * What moves an Inbox item, on the projects' topics: a card (its round, its
 * pull request, its demo — all `board.changed`), its design and the action
 * requests.
 */
const INBOX_EVENTS = [
  BOARD_CHANGED_EVENT,
  CARD_WAITING_EVENT,
  CARD_FINISHED_EVENT,
  DESIGN_LIVE_EVENT,
  ACTION_REQUESTS_LIVE_EVENT,
];

/** A runner going offline pushes nothing: its setup item needs a look now and then. */
const INBOX_SAFETY_POLL_MS = 60_000;

export const EMPTY_INBOX: InboxView = {
  items: [],
  counts: Object.fromEntries(INBOX_ITEM_KINDS.map((k) => [k, 0])) as Record<
    InboxItemKind,
    number
  >,
  total: 0,
  projects: [],
  missing: [],
};

/**
 * `GET /inbox` (C-390, ADR-0101) for the whole shell: one read, so the rail
 * badge, More's "Needs you", Overview's preview and the page count the same
 * items, and a handled item leaves all of them at once. A viewer operates
 * nothing and reads nothing.
 */
export function useInboxSection(
  enabled: boolean,
  projectIds: readonly string[],
): Section<InboxView> {
  const section = useSection(
    () => (enabled ? api<InboxView>('/inbox') : Promise.resolve(EMPTY_INBOX)),
    [enabled],
  );
  useLiveRefresh(enabled ? projectIds : [], INBOX_EVENTS, section.refresh, {
    safetyMs: enabled ? INBOX_SAFETY_POLL_MS : undefined,
  });
  return section;
}

const InboxContext = createContext<Section<InboxView> | null>(null);

export const InboxProvider = InboxContext.Provider;

/** The shell's Inbox; only inside `AppShell`. */
export function useInbox(): Section<InboxView> {
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error('useInbox needs the app shell');
  return inbox;
}
