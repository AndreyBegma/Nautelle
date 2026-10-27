import { hueClasses } from '@andrewbehma/glass-ui/hue';
import type { CardLabelView } from '@nautelle/shared';
import { asHue } from '../../lib/board/labels';

/** D1: the stripe shows this many labels; the rest are in the card sheet. */
export const STRIPE_SEGMENTS_MAX = 3;

/**
 * C-499: a card's labels as a thin stripe on the card's left edge — one equal
 * segment per label, in label order, no names. Placed like `SelectedTint`, so
 * the selected tint and the cursor outline still read on top of it. The names
 * are in the face's header for a screen reader (`LabelsSrText`).
 */
export function LabelStripe({
  labels,
  inline = false,
}: {
  labels: readonly CardLabelView[];
  /**
   * C-502 D5: a row of the Work list has no padded face to hug, so the same
   * segments sit in the row's first cell as a short bar instead.
   */
  inline?: boolean;
}) {
  const shown = labels.slice(0, STRIPE_SEGMENTS_MAX);
  if (shown.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      data-label-stripe={shown.length}
      className={
        inline
          ? 'flex h-6 w-1 flex-col gap-px overflow-hidden rounded-full'
          : 'pointer-events-none absolute -inset-y-[13px] -left-[13px] flex w-1 flex-col gap-px overflow-hidden rounded-l-surface'
      }
    >
      {shown.map((label) => (
        <span
          key={label.id}
          data-label-segment={label.name}
          className={`flex-1 ${hueClasses(asHue(label.hue)).dot}`}
        />
      ))}
    </span>
  );
}

/** The names the stripe leaves out, for a screen reader. */
export function LabelsSrText({ labels }: { labels: readonly CardLabelView[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="sr-only">
      Labels: {labels.map((label) => label.name).join(', ')}
    </span>
  );
}
