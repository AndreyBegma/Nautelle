import { BOARD_CARD_BODY_MAX, BOARD_CARD_TITLE_MAX } from './types';

/** C-391: the text of a Quick card is the card's body, so it shares its limit. */
export const QUICK_CARD_TEXT_MAX = BOARD_CARD_BODY_MAX;

/** The title the fallback cuts from the first line of the text. */
export const QUICK_CARD_FALLBACK_TITLE_MAX = Math.min(BOARD_CARD_TITLE_MAX, 80);

/** `POST /projects/:id/board/cards/draft`: the text of a Quick card. */
export interface QuickCardDraftRequest {
  text: string;
}

/**
 * C-391: the title and kind a cheap model suggests for a Quick card's text.
 * `model` says who wrote them: with no enabled model, or an answer out of
 * contract, the title is the text's first line and the kind a feature — the
 * person edits both before saving anyway.
 */
export interface QuickCardDraft {
  title: string;
  kind: 'feature' | 'bug';
  source: 'model' | 'fallback';
}

/** The first non-blank line of `text`, cut to a card title; empty when blank. */
export const quickCardFallbackTitle = (text: string): string => {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  return line.length > QUICK_CARD_FALLBACK_TITLE_MAX
    ? `${line.slice(0, QUICK_CARD_FALLBACK_TITLE_MAX - 1).trimEnd()}…`
    : line;
};
