'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Checkbox } from '@andrewbehma/glass-ui/checkbox';
import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import type { ProjectLabelView } from '@nautelle/shared';
import { useState } from 'react';
import { LabelSwatch } from './label-swatches';

/**
 * Which labels `label` combines (ADR-0125 D7): when the path rules give all of
 * them, the combined label replaces them on the card.
 */
export function CombinesDialog({
  label,
  labels,
  busy,
  onClose,
  onSave,
}: {
  label: ProjectLabelView | null;
  labels: readonly ProjectLabelView[];
  busy: boolean;
  onClose: () => void;
  onSave: (label: ProjectLabelView, combines: string[]) => void;
}) {
  return (
    <DialogRoot
      open={label !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {label ? (
        <CombinesForm
          // A fresh draft for each label the dialog opens on.
          key={label.id}
          label={label}
          others={labels.filter((other) => other.id !== label.id)}
          busy={busy}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </DialogRoot>
  );
}

function CombinesForm({
  label,
  others,
  busy,
  onClose,
  onSave,
}: {
  label: ProjectLabelView;
  others: readonly ProjectLabelView[];
  busy: boolean;
  onClose: () => void;
  onSave: (label: ProjectLabelView, combines: string[]) => void;
}) {
  const [picked, setPicked] = useState(() => new Set(label.combines));
  const dirty =
    picked.size !== label.combines.length ||
    label.combines.some((id) => !picked.has(id));

  return (
    <DialogContent
      title={`Labels that ${label.name} combines`}
      description={`When the path rules give every label ticked here, ${label.name} replaces them on the card, as fullstack replaces frontend and backend.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="solid"
            disabled={busy || !dirty}
            onClick={() => onSave(label, [...picked])}
          >
            Save
          </Button>
        </>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {others.map((other) => (
          <li key={other.id} className="flex items-center gap-2">
            <Checkbox
              checked={picked.has(other.id)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(other.id);
                else next.delete(other.id);
                setPicked(next);
              }}
              label={other.name}
            />
            <LabelSwatch hue={other.hue} />
          </li>
        ))}
      </ul>
    </DialogContent>
  );
}
