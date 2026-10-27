'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Input } from '@andrewbehma/glass-ui/field';
import {
  LABELS_PER_PROJECT_MAX,
  type ProjectLabelView,
  type UpdateProjectLabelRequest,
} from '@nautelle/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  labelNameProblem,
  nextFreeHue,
} from '../../../../../../lib/labels/settings';
import { HuePicker, LabelSwatch } from './label-swatches';

/** A label's name: edited in place by an admin, saved on Enter or blur. */
function NameField({
  label,
  others,
  readOnly,
  onRename,
}: {
  label: ProjectLabelView;
  others: readonly ProjectLabelView[];
  readOnly: boolean;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(label.name);
  const [error, setError] = useState<string>();
  // The saved name changed under the field (a reload, another admin): follow it.
  const [seen, setSeen] = useState(label.name);
  if (seen !== label.name) {
    setSeen(label.name);
    setDraft(label.name);
    setError(undefined);
  }

  if (readOnly)
    return <span className="font-medium text-sm">{label.name}</span>;

  const commit = async () => {
    const name = draft.trim();
    if (name === label.name) {
      setDraft(label.name);
      setError(undefined);
      return;
    }
    const problem = labelNameProblem(
      name,
      others.filter((other) => other.id !== label.id),
    );
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);
    if (!(await onRename(name))) setDraft(label.name);
  };

  return (
    <>
      <Input
        aria-label={`Name of ${label.name}`}
        aria-invalid={error !== undefined}
        value={draft}
        spellCheck={false}
        maxLength={32}
        className="font-mono"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(label.name);
            setError(undefined);
          }
        }}
      />
      {error ? (
        <p role="alert" className="mt-1 text-danger text-xs">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * C-498: the project's labels — name, colour, order, combinations and delete,
 * one row each; a project admin edits, everyone else reads.
 */
export function LabelList({
  labels,
  cardCounts,
  isAdmin,
  busy,
  onPatch,
  onCombines,
  onDelete,
  onCreate,
}: {
  labels: readonly ProjectLabelView[];
  cardCounts: Readonly<Record<string, number>>;
  isAdmin: boolean;
  busy: boolean;
  onPatch: (
    label: ProjectLabelView,
    body: UpdateProjectLabelRequest,
  ) => Promise<boolean>;
  onCombines: (label: ProjectLabelView) => void;
  onDelete: (label: ProjectLabelView) => void;
  onCreate: (name: string, hue: number) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [hue, setHue] = useState<number>();
  const [newError, setNewError] = useState<string>();
  const nameByLabel = new Map(labels.map((l) => [l.id, l.name]));
  const full = labels.length >= LABELS_PER_PROJECT_MAX;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const problem = labelNameProblem(trimmed, labels);
    if (problem) {
      setNewError(problem);
      return;
    }
    setNewError(undefined);
    if (await onCreate(trimmed, hue ?? nextFreeHue(labels))) {
      setName('');
      setHue(undefined);
    }
  };

  return (
    <div>
      {labels.length === 0 ? (
        <p className="px-4 py-6 text-center text-ink-3 text-sm">
          This project has no labels yet.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {labels.map((label, index) => {
            const cards = cardCounts[label.id] ?? 0;
            const combined = label.combines.flatMap((id) => {
              const found = nameByLabel.get(id);
              return found ? [found] : [];
            });
            return (
              <li
                key={label.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-t px-4 py-3 first:border-t-0"
              >
                <div className="flex min-w-40 flex-1 items-center gap-2">
                  <LabelSwatch hue={label.hue} />
                  <div className="min-w-0 flex-1">
                    <NameField
                      label={label}
                      others={labels}
                      readOnly={!isAdmin}
                      onRename={(next) => onPatch(label, { name: next })}
                    />
                  </div>
                </div>
                <HuePicker
                  label={`Colour of ${label.name}`}
                  value={label.hue}
                  readOnly={!isAdmin}
                  disabled={busy}
                  onChange={(next) => void onPatch(label, { hue: next })}
                />
                <span className="w-16 text-ink-3 text-xs tabular-nums">
                  {cards} {cards === 1 ? 'card' : 'cards'}
                </span>
                <div className="flex min-w-32 flex-1 items-center justify-end gap-1 text-ink-3 text-xs">
                  {isAdmin ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || labels.length < 2}
                        onClick={() => onCombines(label)}
                      >
                        {combined.length > 0 ? 'Edit' : 'Combines…'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        aria-label={`Move ${label.name} up`}
                        disabled={busy || index === 0}
                        onClick={() =>
                          void onPatch(label, { position: index - 1 })
                        }
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        aria-label={`Move ${label.name} down`}
                        disabled={busy || index === labels.length - 1}
                        onClick={() =>
                          void onPatch(label, { position: index + 1 })
                        }
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        aria-label={`Delete ${label.name}`}
                        disabled={busy}
                        onClick={() => onDelete(label)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </div>
                {combined.length > 0 ? (
                  <p className="m-0 basis-full pl-5 text-ink-3 text-xs">
                    Combines {combined.join(', ')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin ? (
        <form
          onSubmit={(event) => void add(event)}
          className="flex flex-wrap items-start gap-3 border-line border-t bg-hover px-4 py-3"
        >
          <div className="min-w-40 flex-1">
            <Input
              aria-label="New label name"
              aria-invalid={newError !== undefined}
              value={name}
              placeholder="design-system"
              spellCheck={false}
              maxLength={32}
              className="font-mono"
              disabled={full}
              onChange={(e) => setName(e.target.value)}
            />
            {newError ? (
              <p role="alert" className="mt-1 text-danger text-xs">
                {newError}
              </p>
            ) : null}
          </div>
          <div className="flex h-(--size-control) items-center">
            <HuePicker
              label="Colour of the new label"
              value={hue ?? nextFreeHue(labels)}
              readOnly={false}
              disabled={full}
              onChange={setHue}
            />
          </div>
          <Button
            variant="glass"
            type="submit"
            disabled={busy || full || name.trim() === ''}
          >
            <Plus size={14} aria-hidden="true" />
            Add label
          </Button>
          {full ? (
            <p className="basis-full text-ink-3 text-xs">
              A project has at most {LABELS_PER_PROJECT_MAX} labels.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
