import { Badge } from '@andrewbehma/glass-ui/badge';
import { StatusPill } from '@andrewbehma/glass-ui/status-pill';
import { Tooltip } from '@andrewbehma/glass-ui/tooltip';
import type { BoardCardView } from '@nautelle/shared';
import { GitMerge } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { faceState } from '../../lib/board/face-state';
import {
  approveRunOffer,
  confidenceLabel,
  fleetHref,
  fleetSummary,
  isSuggestion,
  sessionHref,
  trackedSessionHref,
} from '../../lib/board/format';
import { prChipText } from '../../lib/board/pull-request';
import { ciDot, readinessLine } from '../../lib/board/shipping';
import { githubUrl } from '../../lib/url';
import { ApproveRunLink } from './card-design';
import { FaceIcons, KindIcon } from './card-face-icons';
import {
  type FaceSelection,
  SelectedTint,
  SelectionBox,
  SelectionFrame,
  toggleOnClick,
  UnselectableMark,
} from './selection-box';
import { TAP, TAP_ROW } from './tap';

const TEXT_LINK = `${TAP} text-xs text-accent-ink underline-offset-2 hover:underline`;

/**
 * What a card shows on the board (C-392, after C-35, #423, #778): the **header**
 * (selection box or unselectable mark, label, the kind icon, the design,
 * dependency and demo icons, and the menu trigger at its end), the **title**,
 * the **status** (one state signal, below it the approve offer, detail lines
 * and the face's links) and the **footer** (the PR with its CI dot). That is
 * four signals at most; cost, Saved, Steward, the handoff, hooks, the round
 * pill and the sub-states are in the card sheet (`CardSignals`).
 */
export function CardFace({
  projectId,
  card,
  canOperate,
  menu,
  selection,
  onOpen,
}: {
  projectId: string;
  card: BoardCardView;
  /** #660: triage hints waiting on the card; they are in the card sheet now. */
  hints?: number;
  canOperate: boolean;
  /** The Board's card menu (`slots.menu`), placed at the end of the header. */
  menu?: ReactNode;
  /** #452: set for an operator; a suggestion shows why it has no box instead. */
  selection?: FaceSelection;
  onOpen: (card: BoardCardView) => void;
}) {
  const offer = approveRunOffer(card);
  const state = faceState(card);
  const readiness = readinessLine(card);
  const suggestion = isSuggestion(card);
  const note = 'break-words text-xs text-ink-2';
  return (
    <SelectionFrame>
      {selection?.selected ? <SelectedTint /> : null}
      <div
        data-card-number={card.number}
        data-select-column={card.column}
        data-selected={selection ? selection.selected : undefined}
        onClickCapture={(event) => toggleOnClick(event, selection)}
        className="@container relative flex min-w-0 flex-col gap-1.5 text-sm"
      >
        <div
          data-card-row="header"
          // #497: the menu trigger's 44 px touch target stays inside the row.
          className={`flex h-4 min-w-0 items-center gap-1.5 whitespace-nowrap text-xs leading-4 text-ink-2${menu ? ' pointer-coarse:h-(--size-tap)' : ''}`}
        >
          {selection && !suggestion ? (
            <SelectionBox label={card.label} selection={selection} />
          ) : null}
          {selection && suggestion ? (
            <UnselectableMark
              shown={selection.selecting}
              text="Suggestions are accepted or dismissed one by one"
            />
          ) : null}
          <span className="shrink-0 font-mono">{card.label}</span>
          <KindIcon card={card} />
          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            <FaceIcons card={card} />
            {menu}
          </span>
        </div>
        <button
          type="button"
          className={`${TAP} break-words text-left font-medium underline-offset-2 hover:underline`}
          onClick={() => onOpen(card)}
        >
          {card.title}
        </button>
        <div
          data-card-row="status"
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 empty:hidden"
        >
          {suggestion ? <SuggestionBadges card={card} /> : null}
          {state ? (
            <Tooltip content={state.title}>
              <span data-face-state={state.status}>
                <StatusPill
                  size="sm"
                  status={state.status}
                  label={state.label}
                />
              </span>
            </Tooltip>
          ) : null}
        </div>
        {offer && canOperate ? (
          <>
            <div
              className={`pointer-coarse:flex pointer-coarse:items-center ${TAP_ROW}`}
            >
              <ApproveRunLink
                projectId={projectId}
                card={card}
                offer={offer}
                variant="glass"
                size="sm"
              />
            </div>
            {offer.reason ? (
              <p className="text-xs text-ink-3">{offer.reason}</p>
            ) : null}
          </>
        ) : null}
        {readiness ? (
          <p data-review-readiness="" className={note}>
            {readiness.join(' · ')}
          </p>
        ) : null}
        {card.fleet ? <p className={note}>{fleetSummary(card.fleet)}</p> : null}
        {suggestion && card.captureWhy ? (
          <p className={note}>{card.captureWhy}</p>
        ) : null}
        <FaceLinks projectId={projectId} card={card} suggestion={suggestion} />
        {card.prNumber !== null ? <CardFooter card={card} /> : null}
      </div>
    </SelectionFrame>
  );
}

/** #244: an Inbox card's badge and the model's confidence. */
function SuggestionBadges({ card }: { card: BoardCardView }) {
  const confidence = confidenceLabel(card.captureConfidence);
  return (
    <>
      <Badge tone="warn" size="sm" label="Suggested" />
      {confidence ? (
        <span className="text-xs tabular-nums text-ink-2">
          {confidence} sure
        </span>
      ) : null}
    </>
  );
}

/** The last line of the status: where the terminal, fleet or suggestion face leads. */
function FaceLinks({
  projectId,
  card,
  suggestion,
}: {
  projectId: string;
  card: BoardCardView;
  suggestion: boolean;
}) {
  const session = card.tracking ? trackedSessionHref(card) : null;
  const fleet = card.fleet ? fleetHref(projectId, card) : null;
  const source = suggestion ? sessionHref(card.sourceSessionId) : null;
  if (!session && !fleet && !source) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {session ? (
        <NextLink href={session} className={TEXT_LINK}>
          Session
        </NextLink>
      ) : null}
      {fleet ? (
        <NextLink href={fleet} className={TEXT_LINK}>
          Open in Fleet
        </NextLink>
      ) : null}
      {source ? (
        <NextLink href={source} className={TEXT_LINK}>
          Source session
        </NextLink>
      ) : null}
    </div>
  );
}

/** The PR with its CI dot, above a hairline; the issue is in the card sheet. */
function CardFooter({ card }: { card: BoardCardView }) {
  const dot = ciDot(card);
  const prHref = card.prUrl ? githubUrl(card.prUrl) : null;
  return (
    <div
      data-card-row="footer"
      className="mt-0.5 flex flex-wrap items-center gap-1.5 border-line border-t pt-1.5 text-xs pointer-coarse:gap-y-0 pointer-coarse:pt-0"
    >
      <PrLink href={prHref}>
        {card.prState === 'merged' ? (
          <GitMerge aria-hidden="true" className="size-3 text-status-done" />
        ) : null}
        {prChipText(card)}
      </PrLink>
      {dot ? (
        <span
          role="img"
          aria-label={dot.label}
          title={dot.label}
          className="inline-flex"
        >
          <Badge tone={dot.tone} dot />
        </span>
      ) : null}
    </div>
  );
}

function PrLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  const pill =
    'inline-flex h-5 items-center gap-1 rounded-full bg-hover px-2 text-ink-2 tabular-nums';
  if (!href) return <span className={pill}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      // #497: the anchor is the touch target; the pill inside is what is drawn.
      className={`group/link inline-flex items-center ${TAP}`}
    >
      <span
        className={`${pill} underline-offset-2 group-hover/link:text-ink group-hover/link:underline`}
      >
        {children}
      </span>
    </a>
  );
}
