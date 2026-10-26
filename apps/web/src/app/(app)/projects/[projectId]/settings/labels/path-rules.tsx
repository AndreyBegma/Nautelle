'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Input, Select } from '@andrewbehma/glass-ui/field';
import {
  LABEL_PATTERN_MAX,
  LABEL_RULES_PER_PROJECT_MAX,
  type LabelPathRuleView,
  type ProjectLabelView,
} from '@nautelle/shared';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  moved,
  type RuleDraft,
  ruleProblems,
  rulesChanged,
  rulesToDraft,
  rulesToRequest,
} from '../../../../../../lib/labels/settings';
import { LabelChip } from './label-swatches';

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

/**
 * C-498: the path rules — an ordered list of glob → label, edited as a draft
 * and saved together. The first label a changed file reaches is not special:
 * every matching rule gives its label; the order is the order labels show in.
 */
export function PathRules({
  labels,
  rules,
  isAdmin,
  busy,
  onSave,
}: {
  labels: readonly ProjectLabelView[];
  rules: readonly LabelPathRuleView[];
  isAdmin: boolean;
  busy: boolean;
  onSave: (rules: ReturnType<typeof rulesToRequest>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RuleDraft[]>(() => rulesToDraft(rules));
  // The saved rules changed under the editor (a save, a deleted label, another
  // admin): start the draft again from them.
  const signature = JSON.stringify(rules);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setDraft(rulesToDraft(rules));
  }
  const [pattern, setPattern] = useState('');
  const [labelId, setLabelId] = useState('');
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const chosen = labelById.has(labelId) ? labelId : (labels[0]?.id ?? '');

  const problems = ruleProblems(draft);
  const changed = rulesChanged(draft, rules);
  const canSave = changed && problems.rows.size === 0 && !problems.list;
  const addProblem = pattern.trim()
    ? ruleProblems([{ key: 'add', pattern, labelId: chosen }]).rows.get('add')
    : undefined;

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!pattern.trim() || addProblem || !chosen) return;
    setDraft([
      ...draft,
      { key: newKey(), pattern: pattern.trim(), labelId: chosen },
    ]);
    setPattern('');
  };

  const update = (key: string, patch: Partial<RuleDraft>) =>
    setDraft(
      draft.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  return (
    <div>
      {draft.length === 0 ? (
        <p className="px-4 py-6 text-center text-ink-3 text-sm">
          No path rules. A card is labelled by a person or by the model only.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {draft.map((row, index) => {
            const label = labelById.get(row.labelId);
            const problem = problems.rows.get(row.key);
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 border-line border-t px-4 py-2 first:border-t-0"
              >
                <div className="min-w-40 flex-1">
                  {isAdmin ? (
                    <Input
                      aria-label={`Pattern of rule ${index + 1}`}
                      aria-invalid={problem !== undefined}
                      value={row.pattern}
                      spellCheck={false}
                      maxLength={LABEL_PATTERN_MAX * 2}
                      className="font-mono"
                      onChange={(e) =>
                        update(row.key, { pattern: e.target.value })
                      }
                    />
                  ) : (
                    <span className="inline-block py-1.5 font-mono text-sm">
                      {row.pattern}
                    </span>
                  )}
                  {problem ? (
                    <p role="alert" className="mt-1 text-danger text-xs">
                      {problem}
                    </p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <Select
                    aria-label={`Label of rule ${index + 1}`}
                    value={row.labelId}
                    className="w-40"
                    onChange={(e) =>
                      update(row.key, { labelId: e.target.value })
                    }
                  >
                    {labels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                ) : label ? (
                  <span className="py-1">
                    <LabelChip name={label.name} hue={label.hue} />
                  </span>
                ) : null}
                {isAdmin ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      aria-label={`Move rule ${index + 1} up`}
                      disabled={busy || index === 0}
                      onClick={() => setDraft(moved(draft, index, -1))}
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      aria-label={`Move rule ${index + 1} down`}
                      disabled={busy || index === draft.length - 1}
                      onClick={() => setDraft(moved(draft, index, 1))}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      aria-label={`Remove rule ${index + 1}`}
                      disabled={busy}
                      onClick={() =>
                        setDraft(draft.filter((r) => r.key !== row.key))
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin ? (
        <>
          <form
            onSubmit={add}
            className="flex flex-wrap items-start gap-3 border-line border-t bg-hover px-4 py-3"
          >
            <div className="min-w-40 flex-1">
              <Input
                aria-label="New path glob"
                aria-invalid={addProblem !== undefined}
                value={pattern}
                placeholder="docs/**"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => setPattern(e.target.value)}
              />
              {addProblem ? (
                <p role="alert" className="mt-1 text-danger text-xs">
                  {addProblem}
                </p>
              ) : null}
            </div>
            <Select
              aria-label="Label for the new rule"
              value={chosen}
              className="w-40"
              onChange={(e) => setLabelId(e.target.value)}
            >
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Button
              variant="glass"
              type="submit"
              disabled={
                busy ||
                !pattern.trim() ||
                addProblem !== undefined ||
                !chosen ||
                draft.length >= LABEL_RULES_PER_PROJECT_MAX
              }
            >
              <Plus size={14} aria-hidden="true" />
              Add rule
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify-end gap-3 border-line border-t px-4 py-3">
            <p
              role={problems.list ? 'alert' : undefined}
              className={`mr-auto text-xs ${problems.list ? 'text-danger' : 'text-ink-3'}`}
            >
              {problems.list ??
                (changed
                  ? 'Unsaved changes. Rules are saved together.'
                  : `${draft.length} of ${LABEL_RULES_PER_PROJECT_MAX} rules.`)}
            </p>
            <Button
              variant="ghost"
              disabled={busy || !changed}
              onClick={() => setDraft(rulesToDraft(rules))}
            >
              Discard
            </Button>
            <Button
              variant="solid"
              disabled={busy || !canSave}
              onClick={() => void onSave(rulesToRequest(draft))}
            >
              Save rules
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
