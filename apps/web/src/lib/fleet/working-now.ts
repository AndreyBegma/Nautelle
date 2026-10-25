import type { Status } from '@andrewbehma/glass-ui/status-pill';
import {
  type BoardCardView,
  type BoardView,
  cardQueueText,
  isActiveRoundPhase,
  ownsWorker,
} from '@nautelle/shared';
import { fleetSummary, roundPill } from '../board/format';
import { boardCardHref } from '../board/href';

/**
 * C-397 (ADR-0098): who works on the project right now, read off the Board —
 * the card workers Nautelle runs, the orchestrator's slots and the people's
 * own sessions. Every row is a card, so every row links to it. C-398
 * (ADR-0101): after them, the cards in the run queue, in the order they start.
 */
export type WorkingKind = 'worker' | 'slot' | 'session' | 'queued';

export interface WorkingRow {
  /** Unique per row: one card can be worked by more than one hand. */
  key: string;
  kind: WorkingKind;
  number: number;
  /** C-398: the card's place in the run queue; `null` for any other row. */
  place: number | null;
  label: string;
  title: string;
  /** What the hand is doing, in a few words. */
  state: string;
  status: Status;
  href: string;
}

export const WORKING_KIND_LABEL: Record<WorkingKind, string> = {
  worker: 'Card worker',
  slot: 'Orchestrator slot',
  session: 'Session',
  queued: 'Run queue',
};

const KIND_ORDER: readonly WorkingKind[] = [
  'worker',
  'slot',
  'session',
  'queued',
];

function rowsOf(projectId: string, card: BoardCardView): WorkingRow[] {
  const row = (
    kind: WorkingKind,
    state: string,
    status: Status,
  ): WorkingRow => ({
    key: `${kind}:${card.id}`,
    kind,
    number: card.number,
    place: null,
    label: card.label,
    title: card.title,
    state,
    status,
    href: boardCardHref(projectId, card.number),
  });
  const rows: WorkingRow[] = [];
  if (ownsWorker(card) && isActiveRoundPhase(card.round?.phase)) {
    const pill = roundPill(card.round);
    if (pill) rows.push(row('worker', pill.label, pill.status));
  }
  const fleet = card.fleet;
  if (fleet?.slot && !fleet.slotGone && card.column !== 'completed') {
    rows.push(row('slot', fleetSummary(fleet), 'running'));
  }
  if (card.tracking?.alive) {
    rows.push(row('session', 'Terminal session running', 'running'));
  } else if (card.taken?.alive) {
    rows.push(
      row(
        'session',
        card.taken.branch
          ? `Taken by a session on ${card.taken.branch}`
          : 'Taken by a session',
        'running',
      ),
    );
  }
  if (card.queue && card.column === 'todo') {
    rows.push({
      ...row(
        'queued',
        cardQueueText(card.queue),
        card.queue.state === 'queued' ? 'idle' : 'blocked',
      ),
      place: card.queue.place,
    });
  }
  return rows;
}

/** Queued cards in the order they start; a card waiting for a dependency last. */
const byPlace = (a: WorkingRow, b: WorkingRow): number =>
  (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER);

/**
 * Workers first, then slots, then sessions, each by card number; then the run
 * queue by place.
 */
export function workingNow(view: BoardView): WorkingRow[] {
  return view.columns
    .filter((column) => column.column !== 'inbox')
    .flatMap((column) => column.cards)
    .flatMap((card) => rowsOf(view.projectId, card))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        byPlace(a, b) ||
        a.number - b.number,
    );
}
