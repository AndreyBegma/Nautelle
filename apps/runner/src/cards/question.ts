import { createHash } from 'node:crypto';
import {
  PENDING_QUESTION_LABEL_MAX_CHARS,
  PENDING_QUESTION_MAX_OPTIONS,
  PENDING_QUESTION_TEXT_MAX_CHARS,
  type PendingQuestion,
  type PendingQuestionTab,
  pendingQuestionSchema,
} from '@nautelle/shared';
import { redactText } from '../pane/redact';

/**
 * #473: Claude Code's question selector — the `AskUserQuestion` tool waiting
 * for the person. It is not a permission prompt and not a dialog a runner
 * may answer: the round waits for the person, so the Board says so.
 *
 * The selector is the pane's bottom block: either the key hints
 * `Enter to select · … to navigate` (one question, or one tab of several),
 * or the review screen of several questions, which ends in
 * `1. Submit answers` / `2. Cancel` with no hints under it. The same text
 * anywhere above — scrollback, an agent's output — is never a match.
 */

/** At most this many lines are walked up from the bottom for the header. */
const BLOCK_MAX_LINES = 60;
/**
 * #967: the key hints wrap on a narrow pane — at 80 columns, with the cursor
 * on the "Other" field, `… · ctrl+g to edit in VS Code · Esc` / `to cancel`.
 */
const FOOTER_MAX_LINES = 3;

const FOOTER = /^Enter to select · .*\bto navigate\b/;
const REVIEW_QUESTION = /^Ready to submit your answers\?$/;
const REVIEW_SUBMIT = /^(?:❯\s*)?1\.\s+Submit answers$/;
const REVIEW_CANCEL = /^(?:❯\s*)?2\.\s+Cancel$/;
/** The header line: `☐ glass-ui`, or the tabs `←  ☐ Colour  ☒ Size  ✔ Submit  →`. */
const HEADER = /[☐☒]/;
/** What changes on the header while the person answers. */
const HEADER_STATE = /[☐☒✔←→]/g;

const paneLines = (pane: string): string[] =>
  pane
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/**
 * Where the selector's block ends (the first line after it), and whether it
 * is the review screen of several questions; null when the pane's bottom
 * shows no selector.
 */
const selectorEnd = (
  lines: readonly string[],
): { end: number; review: boolean } | null => {
  const last = lines.length - 1;
  for (let at = last; at >= 0 && last - at < FOOTER_MAX_LINES; at -= 1) {
    if (FOOTER.test(lines.slice(at).join(' '))) {
      return { end: at, review: false };
    }
  }
  const review =
    REVIEW_CANCEL.test(lines[last] ?? '') &&
    REVIEW_SUBMIT.test(lines[last - 1] ?? '') &&
    REVIEW_QUESTION.test(lines[last - 2] ?? '');
  return review ? { end: lines.length, review: true } : null;
};

/** The header's line number above `end`, or -1 when none is in reach. */
const headerAt = (lines: readonly string[], end: number): number => {
  for (let i = end - 1; i >= 0 && end - i <= BLOCK_MAX_LINES; i -= 1) {
    if (HEADER.test(lines[i] ?? '')) return i;
  }
  return -1;
};

const stateless = (header: string): string =>
  header.replace(HEADER_STATE, ' ').replace(/\s+/g, ' ').trim();

export interface PaneQuestion {
  /**
   * The question's header with its answer state left out — the same for
   * every screen of one question, so a question is reported once however
   * the person moves through it.
   */
  readonly key: string;
}

/** The question selector the pane shows as its current prompt, or null. */
export const matchQuestion = (pane: string): PaneQuestion | null => {
  const lines = paneLines(pane);
  const shown = selectorEnd(lines);
  if (!shown) return null;
  const at = headerAt(lines, shown.end);
  return { key: at >= 0 ? stateless(lines[at] ?? '') : '' };
};

const OPTION_LINE = /^(❯\s*)?(\d{1,2})\.\s+(.+)$/;
const SEPARATOR = /^[─━-]{3,}$/;
/** The selector's typed-answer option, and the one that leaves it to chat. */
const OTHER_LABEL = /^Type something\.?$/;
const CHAT_LABEL = /^Chat about this$/;
/** The bar a longer question is quoted with (Claude Code 2.1.310, #913). */
const QUOTE_BAR = /^│\s?/;
/** #967: a multi-select option's box, `[ ] Started` or `[✔] Finished`. */
const CHECKBOX = /^\[([ ✔✓xX])\]\s+(.+)$/;
/** #967: the unnumbered row under a multi-select tab's options. */
const NEXT_ROW = /^(❯\s*)?(?:Next|Submit)$/;

/** A row the cursor stops on: an option's number, or a multi-select tab's Next/Submit. */
export type QuestionRow = number | 'next';

/** One screen of the selector, as the runner answers it. */
export interface QuestionScreen {
  readonly question: PendingQuestion;
  /** The row under the cursor; null when none is marked. */
  readonly cursor: QuestionRow | null;
  /** The number of the "Type something" option; null without one. */
  readonly otherIndex: number | null;
  /** Every row of the screen, in the order the cursor moves (#489 M4). */
  readonly rows: readonly QuestionRow[];
  /**
   * #967: which question or step of the form this is — header without its
   * answer state, the question and the step. It stays while the person
   * moves, types or ticks, and changes once the selector moves on. Kept on
   * the runner: it is not redacted.
   */
  readonly place: string;
  /** The label under the cursor as the pane shows it, box left out. */
  readonly cursorLabel: string | null;
}

const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * ADR-0094: what the selector shows leaves the runner on every project,
 * so it is redacted like hook content (ADR-0021 §4) before it is capped.
 */
const outward = (text: string, max: number): string =>
  cut(redactText(text), max);

const screenKey = (header: string | null, text: string, labels: string[]) =>
  createHash('sha256')
    .update(JSON.stringify([header, text, labels]))
    .digest('hex')
    .slice(0, 16);

/**
 * #967: the tabs of a form of several questions, from its header
 * `←  ☒ Colour  ☐ Size  ✔ Submit  →` — every question with whether it has
 * an answer; the `✔ Submit` step is left out. Null for one question.
 */
const formTabs = (header: string): PendingQuestionTab[] | null => {
  if (!header.startsWith('←')) return null;
  const tabs = header
    .replace(/[←→]/g, ' ')
    .split(/(?=[☐☒✔])/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith('☐') || part.startsWith('☒'))
    .map((part) => ({
      label: outward(part.slice(1).trim(), PENDING_QUESTION_LABEL_MAX_CHARS),
      answered: part.startsWith('☒'),
    }))
    .filter((tab) => tab.label.length > 0);
  return tabs.length > 0 ? tabs.slice(0, PENDING_QUESTION_MAX_OPTIONS) : null;
};

interface ParsedOption {
  index: number;
  label: string;
  checked: boolean | null;
  description: string[];
}

/**
 * #489 M4: the selector's current screen — header, question, options and
 * where the cursor is — or null when the pane shows none (`matchQuestion`).
 * "Type something" is the "Other" field; "Chat about this" is left out.
 * #967: a tab of several questions also names the form's tabs and its step,
 * and a multi-select tab its boxes and its Next/Submit row.
 */
export const readQuestion = (pane: string): QuestionScreen | null => {
  const lines = paneLines(pane);
  const shown = selectorEnd(lines);
  if (!shown) return null;
  const at = headerAt(lines, shown.end);
  const block = lines.slice(at + 1, shown.end);
  const rawHeader = at >= 0 ? (lines[at] ?? '') : null;
  const header =
    rawHeader !== null
      ? rawHeader.replace(/[☐☒✔]/g, ' ').replace(/\s+/g, ' ').trim()
      : null;
  const textLines: string[] = [];
  const options: ParsedOption[] = [];
  const rows: QuestionRow[] = [];
  let cursor: QuestionRow | null = null;
  let cursorLabel: string | null = null;
  for (const line of block) {
    if (SEPARATOR.test(line)) continue;
    const option = OPTION_LINE.exec(line);
    if (option) {
      const index = Number(option[2]);
      const box = CHECKBOX.exec(option[3] ?? '');
      const label = box ? (box[2] ?? '') : (option[3] ?? '');
      if (option[1]) {
        cursor = index;
        cursorLabel = label;
      }
      options.push({
        index,
        label,
        checked: box ? box[1] !== ' ' : null,
        description: [],
      });
      rows.push(index);
      continue;
    }
    const multi = options.some((o) => o.checked !== null);
    const next = multi ? NEXT_ROW.exec(line) : null;
    if (next && !rows.includes('next')) {
      if (next[1]) {
        cursor = 'next';
        cursorLabel = null;
      }
      rows.push('next');
      continue;
    }
    const last = options.at(-1);
    if (last) last.description.push(line);
    else textLines.push(line.replace(QUOTE_BAR, ''));
  }
  const other = options.find((o) => OTHER_LABEL.test(o.label)) ?? null;
  const listed = options.filter(
    (o) => o !== other && !CHAT_LABEL.test(o.label),
  );
  if (listed.length === 0) return null;
  const multiSelect = options.some((o) => o.checked !== null);
  const rawText = textLines.join('\n');
  const text = outward(rawText, PENDING_QUESTION_TEXT_MAX_CHARS);
  const title = header
    ? outward(header, PENDING_QUESTION_LABEL_MAX_CHARS)
    : null;
  const tabs = rawHeader !== null ? formTabs(rawHeader) : null;
  const shownOptions = listed
    .slice(0, PENDING_QUESTION_MAX_OPTIONS)
    .map((o) => {
      const description = o.description.join(' ');
      return {
        index: o.index,
        label: outward(o.label, PENDING_QUESTION_LABEL_MAX_CHARS),
        ...(description
          ? {
              description: outward(
                description,
                PENDING_QUESTION_LABEL_MAX_CHARS,
              ),
            }
          : {}),
        ...(o.checked !== null ? { checked: o.checked } : {}),
      };
    });
  // The key hashes only what is reported, so it never stands for a secret.
  const question = pendingQuestionSchema.parse({
    key: screenKey(title, text, [
      ...options.map(
        (o) =>
          `${o.checked ? '[x] ' : ''}${outward(o.label, PENDING_QUESTION_LABEL_MAX_CHARS)}`,
      ),
    ]),
    header: title,
    text,
    options: shownOptions,
    other: other !== null,
    ...(multiSelect ? { multiSelect: true } : {}),
    ...(tabs
      ? { form: { tabs, step: shown.review ? 'submit' : 'question' } }
      : {}),
  });
  return {
    question,
    cursor,
    otherIndex: other?.index ?? null,
    rows,
    place: JSON.stringify([
      rawHeader !== null ? stateless(rawHeader) : null,
      rawText,
      shown.review,
    ]),
    cursorLabel,
  };
};

/** A tmux key name, or text to type with `send-keys -l`. */
export type AnswerStep =
  | { readonly key: 'Up' | 'Down' | 'Enter' }
  | { readonly literal: string };

/** The cursor moves from row `from` to row `to`; null when either is not on screen. */
const moves = (
  screen: QuestionScreen,
  from: QuestionRow,
  to: QuestionRow,
): AnswerStep[] | null => {
  const at = screen.rows.indexOf(from);
  const target = screen.rows.indexOf(to);
  if (at === -1 || target === -1) return null;
  return Array.from({ length: Math.abs(target - at) }, () =>
    target > at ? { key: 'Down' as const } : { key: 'Up' as const },
  );
};

/**
 * #489 M4: the keys that answer `screen` with option `index`, or with typed
 * `text` in its "Other" field — cursor moves to the option, then Enter (the
 * typed text goes between). Null when the screen has no such option.
 * #967: on a multi-select tab Enter ticks a box, and typing ticks the
 * "Other" one; the answer ticks its option (unless ticked already), then
 * moves to the tab's Next/Submit row and presses Enter there.
 */
export const answerSteps = (
  screen: QuestionScreen,
  answer: { index: number } | { text: string },
): AnswerStep[] | null => {
  const target = 'index' in answer ? answer.index : screen.otherIndex;
  if (target === null) return null;
  if (
    'index' in answer &&
    !screen.question.options.some((o) => o.index === target)
  ) {
    return null;
  }
  const from = screen.cursor ?? screen.rows[0] ?? 0;
  const toTarget = moves(screen, from, target);
  if (!toTarget) return null;
  if (!screen.question.multiSelect) {
    return 'text' in answer
      ? [...toTarget, { literal: answer.text }, { key: 'Enter' }]
      : [...toTarget, { key: 'Enter' }];
  }
  const toNext = moves(screen, target, 'next');
  if (!toNext) return null;
  const ticked =
    'index' in answer &&
    screen.question.options.some((o) => o.index === target && o.checked);
  const pick: AnswerStep[] =
    'text' in answer
      ? [{ literal: answer.text }]
      : ticked
        ? []
        : [{ key: 'Enter' }];
  return [...toTarget, ...pick, ...toNext, { key: 'Enter' }];
};

/** The row the last Enter of `answerSteps(screen, answer)` is pressed on. */
export const answerRow = (
  screen: QuestionScreen,
  answer: { index: number } | { text: string },
): QuestionRow | null => {
  if (screen.question.multiSelect) return 'next';
  return 'index' in answer ? answer.index : screen.otherIndex;
};
