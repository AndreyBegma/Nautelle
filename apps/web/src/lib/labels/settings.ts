import type { Hue } from '@andrewbehma/glass-ui/hue';
import {
  BOARD_ERROR,
  LABEL_NAME_PATTERN,
  LABEL_RULES_PER_PROJECT_MAX,
  type LabelPathRuleView,
  labelPatternProblem,
  type ProjectLabelView,
} from '@nautelle/shared';
import { ApiError } from '../api';
import { describeBoardError } from '../board/format';

/** The eight identity hues in glass-ui's order, named as `tokens.css` names them. */
export const LABEL_HUES: readonly { hue: Hue; name: string }[] = [
  { hue: 1, name: 'Blue' },
  { hue: 2, name: 'Teal' },
  { hue: 3, name: 'Green' },
  { hue: 4, name: 'Amber' },
  { hue: 5, name: 'Orange' },
  { hue: 6, name: 'Red' },
  { hue: 7, name: 'Violet' },
  { hue: 8, name: 'Pink' },
];

/** The hue a label wears; an out-of-range number from the API falls back to blue. */
export const hueOf = (hue: number): Hue =>
  LABEL_HUES.find((h) => h.hue === hue)?.hue ?? 1;

export const hueName = (hue: number): string =>
  LABEL_HUES.find((h) => h.hue === hue)?.name ?? 'Blue';

/** A message when `name` cannot be a label's name, else `undefined`. */
export function labelNameProblem(
  name: string,
  others: readonly Pick<ProjectLabelView, 'name'>[],
): string | undefined {
  if (!LABEL_NAME_PATTERN.test(name)) {
    return 'Use 1–32 lower-case letters, digits and dashes, starting with a letter or digit.';
  }
  if (others.some((other) => other.name === name)) {
    return 'Another label already has this name.';
  }
  return undefined;
}

/** The first colour a new label gets: the least used hue, in palette order. */
export function nextFreeHue(labels: readonly Pick<ProjectLabelView, 'hue'>[]) {
  const used = (hue: number) => labels.filter((l) => l.hue === hue).length;
  return LABEL_HUES.reduce((best, h) =>
    used(h.hue) < used(best.hue) ? h : best,
  ).hue;
}

/** What deleting a label does, for the confirmation. */
export function deleteConsequence(name: string, cards: number): string {
  const where =
    cards === 0
      ? 'No card shows it.'
      : `It is removed from ${cards} ${cards === 1 ? 'card' : 'cards'}.`;
  return `${where} Its path rules go with it and it is dropped from every label that combines it. A deleted label cannot be restored — ${name} would have to be created again.`;
}

/** One row of the path-rule editor; `key` is stable while the row is edited. */
export interface RuleDraft {
  key: string;
  pattern: string;
  labelId: string;
}

export const rulesToDraft = (
  rules: readonly LabelPathRuleView[],
): RuleDraft[] =>
  rules.map((rule) => ({
    key: rule.id,
    pattern: rule.pattern,
    labelId: rule.labelId,
  }));

/** Patterns are saved trimmed. */
export const rulesToRequest = (draft: readonly RuleDraft[]) =>
  draft.map(({ pattern, labelId }) => ({
    pattern: pattern.trim(),
    labelId,
  }));

/** Whether the draft differs from the saved rules in content or order. */
export function rulesChanged(
  draft: readonly RuleDraft[],
  saved: readonly LabelPathRuleView[],
): boolean {
  return (
    draft.length !== saved.length ||
    draft.some(
      (row, i) =>
        row.pattern.trim() !== saved[i]?.pattern ||
        row.labelId !== saved[i]?.labelId,
    )
  );
}

/** A message per row key that cannot be saved, and one for the whole list. */
export function ruleProblems(draft: readonly RuleDraft[]): {
  rows: Map<string, string>;
  list: string | undefined;
} {
  const rows = new Map<string, string>();
  for (const row of draft) {
    const problem = labelPatternProblem(row.pattern.trim());
    if (problem) rows.set(row.key, problem);
  }
  return {
    rows,
    list:
      draft.length > LABEL_RULES_PER_PROJECT_MAX
        ? `A project has at most ${LABEL_RULES_PER_PROJECT_MAX} path rules.`
        : undefined,
  };
}

/** Moves the item at `from` by `by` places, staying inside the list. */
export function moved<T>(list: readonly T[], from: number, by: number): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length || from < 0 || from >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** A sentence for the person; the label routes' own refusals say what is wrong. */
export function describeLabelError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code as string | undefined) {
      case BOARD_ERROR.labelNameTaken:
        return 'Another label already has this name.';
      case BOARD_ERROR.labelLimit:
      case BOARD_ERROR.patternInvalid:
      case BOARD_ERROR.labelUnknown:
        return error.message;
      default:
        break;
    }
    if (error.status === 404) {
      return 'That label no longer exists. The list was reloaded.';
    }
    if (error.status === 403) return 'Only a project admin can edit labels.';
  }
  return describeBoardError(error);
}
