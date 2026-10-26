/**
 * C-497 (ADR-0125): card labels. A project owns its labels — a kebab name, one
 * of glass-ui's eight identity hues, a position — and each card-label row
 * records who set it. A person's label is the truth: automation never removes
 * or overrides one, and never adds back a label a person removed.
 */

/** Who set a card's label (D4). */
export const CARD_LABEL_SOURCES = ['person', 'model', 'paths'] as const;
export type CardLabelSource = (typeof CARD_LABEL_SOURCES)[number];

/** The sources automation writes through `BoardLabels.applyAuto`. */
export type CardLabelAutoSource = Exclude<CardLabelSource, 'person'>;

/** D2: glass-ui's identity hues, `--color-hue-1` … `--color-hue-8`. */
export const LABEL_HUE_MIN = 1;
export const LABEL_HUE_MAX = 8;

/** D7: lower-case kebab, so MCP and Telegram can name a label. */
export const LABEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** D8: the limits. */
export const LABELS_PER_PROJECT_MAX = 30;
export const LABEL_RULES_PER_PROJECT_MAX = 50;
export const LABEL_PATTERN_MAX = 200;
export const LABELS_PER_CARD_MAX = 5;

/** The live event after a project's labels, rules or label settings change. */
export const LABELS_CHANGED_EVENT = 'labels.changed';

export interface StarterLabel {
  name: string;
  hue: number;
  /** Names of the starter labels this one combines (D6). */
  combines: readonly string[];
}

/**
 * D1, D3: every project starts with these, in this order. Amber and red are
 * left out: they sit next to `warn` and `danger` on a Board full of state.
 */
export const STARTER_LABELS: readonly StarterLabel[] = [
  { name: 'frontend', hue: 1, combines: [] },
  { name: 'backend', hue: 3, combines: [] },
  { name: 'fullstack', hue: 2, combines: ['frontend', 'backend'] },
  { name: 'redesign', hue: 8, combines: [] },
  { name: 'infra', hue: 5, combines: [] },
  { name: 'docs', hue: 7, combines: [] },
];

/** The starter path rules, in order; `label` is a starter label's name. */
export const STARTER_LABEL_RULES: readonly {
  pattern: string;
  label: string;
}[] = [
  { pattern: 'apps/web/**', label: 'frontend' },
  { pattern: 'apps/api/**', label: 'backend' },
  { pattern: 'docs/**', label: 'docs' },
  { pattern: 'deploy/**', label: 'infra' },
  { pattern: '.woodpecker/**', label: 'infra' },
];

/**
 * Why a path rule's pattern is refused, or `null` when it is fine. A pattern
 * is a repository-relative glob of `*`, `**` (a whole segment) and `?`; it
 * has no leading `/`, no `.` or `..` segment, no empty segment and no
 * backslash, bracket or brace.
 */
export const labelPatternProblem = (pattern: string): string | null => {
  if (pattern.length === 0) return 'The pattern is empty';
  if (pattern.length > LABEL_PATTERN_MAX) {
    return `A pattern has at most ${LABEL_PATTERN_MAX} characters`;
  }
  if (pattern.trim() !== pattern) {
    return 'A pattern has no leading or trailing spaces';
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing them is the point.
  if (/[\u0000-\u001f\u007f]/.test(pattern)) {
    return 'A pattern has no control characters';
  }
  if (/[\\[\]{}]/.test(pattern)) {
    return 'A pattern uses only *, ** and ? as wildcards; no backslash, bracket or brace';
  }
  if (pattern.startsWith('/')) {
    return 'A pattern is relative to the repository root; no leading /';
  }
  for (const segment of pattern.split('/')) {
    if (segment === '') {
      return 'A pattern has no empty segment; write dir/** for a folder';
    }
    if (segment === '.' || segment === '..') {
      return 'A pattern has no . or .. segment';
    }
    if (segment.includes('**') && segment !== '**') {
      return '** is a whole segment, as in apps/**/test';
    }
  }
  return null;
};

/** A label of the project. */
export interface ProjectLabelView {
  id: string;
  name: string;
  /** 1–8, glass-ui's `--color-hue-N` (D2). */
  hue: number;
  /** 0-based and dense: the order in Settings, on the stripe and in chips. */
  position: number;
  /** The ids of the labels this one combines (D6), in position order. */
  combines: string[];
}

/** A path rule of the project: files matching `pattern` suggest `labelId`. */
export interface LabelPathRuleView {
  id: string;
  pattern: string;
  labelId: string;
  /** 0-based and dense. */
  position: number;
}

/** `GET /projects/:id/labels`. */
export interface ProjectLabelsResponse {
  labels: ProjectLabelView[];
  rules: LabelPathRuleView[];
  /**
   * C-498: label id → the cards that show it (a label a person removed from a
   * card does not count); a label no card shows is absent.
   */
  cardCounts: Record<string, number>;
  /** `labelSuggest`: the model suggests labels for a new card. */
  suggest: boolean;
  /** `labelPaths`: path rules label a card from its changed files. */
  paths: boolean;
}

/** `POST /projects/:id/labels` (admin): appended last. */
export interface CreateProjectLabelRequest {
  name: string;
  hue: number;
}

/**
 * `PATCH /projects/:id/labels/:labelId` (admin). `position` moves the label
 * to that 0-based index; `combines` replaces the ids it combines.
 */
export interface UpdateProjectLabelRequest {
  name?: string;
  hue?: number;
  position?: number;
  combines?: string[];
}

/** `PUT /projects/:id/labels/rules` (admin): replaces the ordered list. */
export interface ReplaceLabelRulesRequest {
  rules: { pattern: string; labelId: string }[];
}

/**
 * `PUT /projects/:id/board/cards/:number/labels` (operator): the person's
 * truth. Each listed label becomes theirs; each label the card shows and the
 * list leaves out becomes a removal automation respects.
 */
export interface SetCardLabelsRequest {
  labelIds: string[];
}

/** A label a card shows: rows a person removed are left out. */
export interface CardLabelView {
  id: string;
  name: string;
  hue: number;
  source: CardLabelSource;
}
