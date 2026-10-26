'use client';

import { hueClasses } from '@andrewbehma/glass-ui/hue';
import { hueOf, LABEL_HUES } from '../../../../../../lib/labels/settings';

/** A label's colour as a square swatch — a project identity hue, never a status dot. */
export function LabelSwatch({ hue }: { hue: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-[3px] ${hueClasses(hueOf(hue)).dot}`}
    />
  );
}

/** The label as a chip tinted in its hue, with its swatch. */
export function LabelChip({ name, hue }: { name: string; hue: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs ${hueClasses(hueOf(hue)).soft}`}
    >
      <LabelSwatch hue={hue} />
      {name}
    </span>
  );
}

/**
 * The eight glass-ui hues as a group of toggle buttons, one pressed. A viewer
 * sees the choice but cannot change it.
 */
export function HuePicker({
  label,
  value,
  readOnly,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  readOnly: boolean;
  disabled?: boolean;
  onChange: (hue: number) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 gap-1.5 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {LABEL_HUES.map(({ hue, name }) => {
        const selected = hue === value;
        return (
          <button
            key={hue}
            type="button"
            aria-pressed={selected}
            aria-label={name}
            aria-disabled={readOnly || undefined}
            disabled={disabled}
            tabIndex={readOnly ? -1 : undefined}
            onClick={() => {
              if (!readOnly && !selected) onChange(hue);
            }}
            className={`size-6 rounded-md ${hueClasses(hue).dot} ${
              selected
                ? 'ring-2 ring-ink ring-offset-2 ring-offset-ground'
                : readOnly
                  ? 'opacity-30'
                  : 'opacity-70 hover:opacity-100'
            } ${readOnly ? 'cursor-default' : ''}`}
          />
        );
      })}
    </fieldset>
  );
}
