import { Tooltip } from '@andrewbehma/glass-ui/tooltip';
import type { BoardCardView } from '@nautelle/shared';
import { Bug, ImageIcon, Link2, ListChecks, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { dependencyChip } from '../../lib/board/dependencies';
import { demoChip } from '../../lib/demos/format';
import {
  cardDesignChipState,
  cardDesignChipText,
} from '../../lib/design/format';

const ICON = 'size-3.5 shrink-0';

const TONE_CLASS = {
  neutral: 'text-ink-3',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
} as const;

/** One small icon with its accessible name; the name is also the tooltip. */
function FaceIcon({
  label,
  tone = 'neutral',
  dataAttr,
  children,
}: {
  label: string;
  tone?: keyof typeof TONE_CLASS;
  dataAttr: string;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        {...{ [dataAttr]: '' }}
        className={`inline-flex ${TONE_CLASS[tone]}`}
      >
        {children}
      </span>
    </Tooltip>
  );
}

/**
 * C-392: the kind as a small red bug; C-510: a task as a quiet check-list
 * icon, the one thing that tells it from a code card at a glance; any other
 * kind is the default.
 */
export function KindIcon({ card }: { card: BoardCardView }) {
  if (card.kind === 'task') {
    return (
      <FaceIcon label="Task" dataAttr="data-kind-icon">
        <ListChecks aria-hidden="true" className={ICON} />
      </FaceIcon>
    );
  }
  if (card.kind !== 'bug') return null;
  return (
    <FaceIcon label="Bug" tone="danger" dataAttr="data-kind-icon">
      <Bug aria-hidden="true" className={ICON} />
    </FaceIcon>
  );
}

/**
 * C-392: the icons at the end of a tile's header — design, dependency, demo.
 * Each one is drawn only when the card has the thing; the state is its tone
 * and its accessible name, the detail is in the card sheet.
 */
export function FaceIcons({ card }: { card: BoardCardView }) {
  const design = cardDesignChipState(card.design);
  const after = dependencyChip(card.dependsOn);
  const demo = card.demo ? demoChip(card.demo) : null;
  if (design === 'off' && !after && !demo) return null;
  return (
    <span className="flex items-center gap-1.5">
      {design !== 'off' ? (
        <FaceIcon
          label={cardDesignChipText(card.design, Date.now())}
          tone={design === 'approved' ? 'ok' : 'neutral'}
          dataAttr="data-design-icon"
        >
          <ImageIcon aria-hidden="true" className={ICON} />
        </FaceIcon>
      ) : null}
      {after ? (
        <FaceIcon
          label={after.title}
          tone={after.open ? 'warn' : 'neutral'}
          dataAttr="data-dependency-icon"
        >
          <Link2 aria-hidden="true" className={ICON} />
        </FaceIcon>
      ) : null}
      {demo && card.demo ? (
        <FaceIcon label={demo.title} tone={demo.tone} dataAttr="data-demo-icon">
          <Play aria-hidden="true" className={ICON} />
        </FaceIcon>
      ) : null}
    </span>
  );
}
