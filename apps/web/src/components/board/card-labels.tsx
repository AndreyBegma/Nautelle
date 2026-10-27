'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button } from '@andrewbehma/glass-ui/button';
import { Combobox } from '@andrewbehma/glass-ui/combobox';
import { toast } from '@andrewbehma/glass-ui/toast';
import { Tooltip } from '@andrewbehma/glass-ui/tooltip';
import {
  type BoardCardView,
  type CardLabelView,
  LABELS_PER_CARD_MAX,
  type ProjectLabelView,
} from '@nautelle/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { describeBoardError } from '../../lib/board/format';
import {
  AUTO_LABEL_HINT,
  asHue,
  fetchProjectLabels,
  setCardLabels,
} from '../../lib/board/labels';
import { settingsItemHref } from '../../lib/projects/settings-sections';
import { useSection } from '../../lib/section/use-section';

/**
 * C-499: a card's labels in its sheet — a coloured chip each, an "auto" marker
 * on one automation set (with where it came from), and for an operator a
 * multi-select over the project's labels. What the operator saves is the
 * person's truth (ADR-0125): a label they take off does not come back.
 */
export function CardLabels({
  projectId,
  card,
  canOperate,
  onSaved,
}: {
  projectId: string;
  card: Pick<BoardCardView, 'number' | 'labels'>;
  canOperate: boolean;
  onSaved: () => void;
}) {
  const project = useSection(() => fetchProjectLabels(projectId), [projectId]);
  const known: readonly ProjectLabelView[] = project.data?.labels ?? [];
  const current = useMemo(
    () => card.labels.map((label) => label.id),
    [card.labels],
  );
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  // A newer card (a live push, or the save below) replaces the selection.
  useEffect(() => setSelected(current), [current]);

  const options = useMemo(
    () => known.map((label) => ({ value: label.id, label: label.name })),
    [known],
  );
  // The chips follow the selection; a label the card already had keeps its source.
  const chips = selected.flatMap((id) => {
    const had = card.labels.find((label) => label.id === id);
    if (had) return [{ ...had }];
    const label = known.find((l) => l.id === id);
    return label
      ? [{ id, name: label.name, hue: label.hue, source: 'person' as const }]
      : [];
  });

  const save = async (next: string[]) => {
    const limited = next.slice(0, LABELS_PER_CARD_MAX);
    setSelected(limited);
    setSaving(true);
    try {
      await setCardLabels(projectId, card.number, { labelIds: limited });
      onSaved();
    } catch (err) {
      setSelected(current);
      toast.error(describeBoardError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {editing ? null : <LabelChips chips={chips} />}
      <Link
        href={settingsItemHref(projectId, 'labels')}
        className="w-fit text-sm font-medium underline-offset-2 hover:underline"
      >
        Manage labels
      </Link>
      {canOperate && options.length > 0 && !editing ? (
        <div>
          <Button variant="glass" size="sm" onClick={() => setEditing(true)}>
            Edit labels
          </Button>
        </div>
      ) : null}
      {canOperate && editing ? (
        <Combobox
          multiple
          aria-label="Labels"
          options={options}
          value={selected}
          disabled={saving}
          placeholder="Add a label"
          onValueChange={(next) => void save(next)}
        />
      ) : null}
      {editing ? (
        <div>
          <Button
            variant="glass"
            size="sm"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Done
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The chips: a coloured chip per label, "auto" on one automation set. */
export function LabelChips({ chips }: { chips: readonly CardLabelView[] }) {
  if (chips.length === 0)
    return <p className="text-sm text-ink-2">No labels.</p>;
  return (
    <ul
      aria-label="Labels"
      data-card-labels=""
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map((chip) => (
        <li key={chip.id} className="flex items-center gap-1">
          <Badge hue={asHue(chip.hue)} label={chip.name} />
          {chip.source !== 'person' ? (
            <Tooltip content={AUTO_LABEL_HINT[chip.source]}>
              <span data-label-auto="">
                <Badge tone="neutral" size="sm" label="auto" />
              </span>
            </Tooltip>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
