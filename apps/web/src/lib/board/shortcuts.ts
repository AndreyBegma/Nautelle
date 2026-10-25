import type { BoardCardView } from '@nautelle/shared';
import { isPlanItem } from './plan-tasks';
import { type ColumnItem, isStackItem } from './stacks';

/** C-393: one row of the `?` cheat sheet. */
export interface Shortcut {
  keys: readonly string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: readonly Shortcut[];
}

/**
 * Every keyboard shortcut the app has, for the `?` cheat sheet. The Board's
 * are the ones `useBoardShortcuts` handles; the rest live in the shell.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Board',
    shortcuts: [
      { keys: ['j', '↓'], label: 'Next card' },
      { keys: ['k', '↑'], label: 'Previous card' },
      { keys: ['Enter'], label: 'Open the card' },
      { keys: ['r'], label: 'Run the card' },
      { keys: ['a'], label: 'Accept the card' },
      { keys: ['n'], label: 'New card' },
      { keys: ['?'], label: 'Show this list' },
      { keys: ['Esc'], label: 'Clear the selection' },
      { keys: ['⌘/Ctrl', 'A'], label: 'Select the column under the pointer' },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      {
        keys: ['⌘/Ctrl', 'K'],
        label: 'Command palette: actions, cards, pages',
      },
      { keys: ['⌘/Ctrl', '\\'], label: 'Fold the rail' },
    ],
  },
];

/** A control that has its own use for the key: a field, a button, a link, a menu. */
const OWN_KEYS =
  'input, textarea, select, button, a[href], [role="menuitem"], [role="option"], [contenteditable=""], [contenteditable="true"]';

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The Board's keys only act when the key would otherwise do nothing. */
export const isFreeKeyTarget = (target: EventTarget | null): boolean =>
  !(target instanceof HTMLElement) || target.closest(OWN_KEYS) === null;

/** Every card the Board shows, column by column, top to bottom; stacks and plan tasks are skipped. */
export function cardsInOrder(
  columns: readonly { cards: readonly ColumnItem[] }[],
): BoardCardView[] {
  return columns.flatMap((column) =>
    column.cards.flatMap((item) =>
      isStackItem(item) || isPlanItem(item) ? [] : [item.card],
    ),
  );
}

/**
 * The card number the cursor moves to: `step` away from `current`, held at
 * the ends. With no cursor (or a card that left the Board) the first key
 * lands on the first card going down and the last going up.
 */
export function moveCursor(
  order: readonly number[],
  current: number | undefined,
  step: 1 | -1,
): number | undefined {
  if (order.length === 0) return undefined;
  const at = current === undefined ? -1 : order.indexOf(current);
  if (at === -1) return step === 1 ? order[0] : order.at(-1);
  return order[Math.min(order.length - 1, Math.max(0, at + step))];
}
