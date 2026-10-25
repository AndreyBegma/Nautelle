import {
  BOARD_CARD_TITLE_MAX,
  BOARD_ERROR,
  type BoardCardKind,
  type BoardCardView,
  type CreateBoardCardRequest,
  QUICK_CARD_TEXT_MAX,
  type QuickCardDraft,
  quickCardFallbackTitle,
} from '@nautelle/shared';
import { ApiError, api } from '../api';
import { createCard, runCard } from './actions';
import { describeBoardError } from './format';

/** Characters of text that make a title worth asking a model for. */
export const QUICK_DRAFT_MIN_CHARS = 12;

/** The pause after the last keystroke before the model is asked. */
export const QUICK_DRAFT_DEBOUNCE_MS = 900;

/**
 * How long Save waits on a suggestion still on its way. Past it, the card is
 * saved with the text's first line: the model never holds Enter up for long.
 */
export const QUICK_DRAFT_WAIT_MS = 1_500;

export { QUICK_CARD_TEXT_MAX };

/** The draft if it arrives within `ms`, otherwise null (it is not cancelled). */
export function draftWithin<T>(
  draft: Promise<T | null>,
  ms: number = QUICK_DRAFT_WAIT_MS,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([draft, late]).finally(() => clearTimeout(timer));
}

export const draftQuickCard = (projectId: string, text: string) =>
  api<QuickCardDraft>(
    `/projects/${encodeURIComponent(projectId)}/board/cards/draft`,
    { method: 'POST', body: { text } },
  );

/** What the person typed, ready to save: the dialog's fields. */
export interface QuickCardInput {
  text: string;
  /** Empty while neither the person nor the model wrote one. */
  title: string;
  kind: BoardCardKind;
  runNow: boolean;
  attachmentIds: string[];
}

/** Whether Save can run: some text, and no upload still going. */
export const quickCardReady = (
  input: Pick<QuickCardInput, 'text'>,
  uploading: boolean,
): boolean => input.text.trim() !== '' && !uploading;

/**
 * The title and kind to save: a field the person wrote wins, otherwise the
 * model's draft (when one arrived), otherwise what the form holds.
 */
export function mergeQuickDraft(
  fields: Pick<QuickCardInput, 'title' | 'kind'>,
  touched: { title: boolean; kind: boolean },
  draft: Pick<QuickCardDraft, 'title' | 'kind'> | null,
): Pick<QuickCardInput, 'title' | 'kind'> {
  return {
    title: touched.title || !draft ? fields.title : draft.title,
    kind: touched.kind || !draft ? fields.kind : draft.kind,
  };
}

/**
 * The card's request. A blank title falls back to the text's first line, so
 * Enter on a fast typist is never blocked by the model; the kind is the
 * person's (or the model's) pick, so it counts as set.
 */
export function quickCardRequest(
  input: QuickCardInput,
): CreateBoardCardRequest {
  const text = input.text.trim();
  const title = (input.title.trim() || quickCardFallbackTitle(text)).slice(
    0,
    BOARD_CARD_TITLE_MAX,
  );
  return {
    title,
    body: text,
    kind: input.kind,
    ...(input.attachmentIds.length > 0
      ? { attachmentIds: input.attachmentIds }
      : {}),
  };
}

/**
 * How the optional Run went. `waiting`: the project has no free slot, so the
 * card is in the run queue (C-398, ADR-0102) and starts when one frees.
 */
export type QuickCardRun =
  | { state: 'not_requested' }
  | { state: 'started' }
  | { state: 'waiting' }
  | { state: 'refused'; message: string };

export interface QuickCardResult {
  card: BoardCardView;
  run: QuickCardRun;
}

/**
 * One step: create the card in To Do and, with Run now, start it. A card that
 * was created stays created whatever Run answers — the result carries why it
 * did not start.
 */
export async function saveQuickCard(
  projectId: string,
  input: QuickCardInput,
  calls: {
    create: typeof createCard;
    run: typeof runCard;
  } = { create: createCard, run: runCard },
): Promise<QuickCardResult> {
  const card = await calls.create(projectId, quickCardRequest(input));
  if (!input.runNow) return { card, run: { state: 'not_requested' } };
  try {
    const done = await calls.run(projectId, card.number);
    // C-398: at the worker limit Run queues the card instead of refusing it.
    return { card, run: { state: done.queue ? 'waiting' : 'started' } };
  } catch (error) {
    // An API without the run queue still refuses at the limit; the card waits
    // in To Do either way. `ApiError.code` is typed for auth codes; a board
    // code travels in it too.
    if (
      error instanceof ApiError &&
      (error.code as string | undefined) === BOARD_ERROR.maxRunning
    ) {
      return { card, run: { state: 'waiting' } };
    }
    return {
      card,
      run: { state: 'refused', message: describeBoardError(error) },
    };
  }
}
