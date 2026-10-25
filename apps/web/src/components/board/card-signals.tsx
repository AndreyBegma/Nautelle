import { Badge } from '@andrewbehma/glass-ui/badge';
import { Chip } from '@andrewbehma/glass-ui/chip';
import { StatusPill } from '@andrewbehma/glass-ui/status-pill';
import { Tooltip } from '@andrewbehma/glass-ui/tooltip';
import type { BoardCardView } from '@nautelle/shared';
import { Zap } from 'lucide-react';
import {
  collectFailedBadge,
  isSessionAlive,
  SLOT_GONE_TEXT,
  TRACKED_TEXT,
} from '../../lib/board/format';
import { shippingBadge } from '../../lib/board/shipping';
import { SESSION_ENDED_TEXT, takenState } from '../../lib/board/taken';
import { StewardChip } from '../steward/steward-chip';
import { RestartChip } from './handoff/restart-chip';
import { QuotaWaitLine } from './quota-wait-line';

/** #282 D1: a card tracked from a terminal session: the badge and the state. */
function TerminalBadges({ card }: { card: BoardCardView }) {
  return (
    <>
      <Tooltip content={TRACKED_TEXT}>
        <span>
          <Badge tone="neutral" size="sm" label="Terminal" />
        </span>
      </Tooltip>
      {isSessionAlive(card) ? (
        <StatusPill size="sm" status="running" label="Session running" />
      ) : null}
      {card.autoCollect ? <Chip size="sm">Automatic work</Chip> : null}
    </>
  );
}

/** #845 D2, D10: "taken by <session>" / "queued for <session>", and "session ended". */
function TakenBadges({ card }: { card: BoardCardView }) {
  const state = takenState(card);
  if (!state) return null;
  return (
    <>
      <Chip size="sm">{state.text}</Chip>
      {state.kind === 'taken' && !state.alive ? (
        <Chip size="sm">{SESSION_ENDED_TEXT}</Chip>
      ) : null}
    </>
  );
}

/** #282 D4: a mirrored fleet slot: the badge and "Slot gone". */
function FleetBadges({ card }: { card: BoardCardView }) {
  return (
    <>
      <Badge tone="neutral" size="sm" label="Fleet" />
      {card.fleet?.slotGone ? (
        <Tooltip content="The slot left the fleet; the card keeps its last column.">
          <span>
            <Badge tone="warn" size="sm" label={SLOT_GONE_TEXT} />
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}

/**
 * C-392: what the board tile no longer shows — the sub-state, Steward, the
 * handoff restart, the collect failure, Auto-run and the terminal, taken and
 * fleet badges — as one wrapping row in the card sheet's header. Empty when
 * the card has none of them.
 */
export function CardSignals({ card }: { card: BoardCardView }) {
  const badge = shippingBadge(card);
  const notPushed = collectFailedBadge(card);
  return (
    <div
      data-card-signals=""
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 empty:hidden"
    >
      {badge ? (
        <Tooltip content={badge.label}>
          <span>
            <Badge tone={badge.tone} size="md" label={badge.label} />
          </span>
        </Tooltip>
      ) : null}
      {notPushed ? (
        <Tooltip content={notPushed.text}>
          <span>
            <Badge tone="warn" size="md" label={notPushed.label} />
          </span>
        </Tooltip>
      ) : null}
      {card.round?.quotaWait ? (
        <QuotaWaitLine wait={card.round.quotaWait} />
      ) : null}
      {card.steward ? <StewardChip chip={card.steward} /> : null}
      <RestartChip card={card} />
      {card.autoRunWhenReady ? (
        <Chip size="sm" title="Auto-run when ready is on" className="gap-1">
          <Zap aria-hidden="true" className="size-3" />
          Auto-run
        </Chip>
      ) : null}
      {card.tracking ? <TerminalBadges card={card} /> : null}
      <TakenBadges card={card} />
      {card.fleet ? <FleetBadges card={card} /> : null}
    </div>
  );
}
