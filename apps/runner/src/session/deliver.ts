import type { SessionMessageOutcome } from '@nautelle/shared';
import {
  answerRow,
  answerSteps,
  type QuestionScreen,
  readQuestion,
} from '../cards/question';
import type { TmuxControl } from '../control/tmux';
import { inputText, readPane } from '../steward/pane-rules';

/** The tmux calls delivery makes — `TmuxControl`'s, exact-target each. */
export type DeliveryTmux = Pick<
  TmuxControl,
  'capture' | 'sendLiteral' | 'sendSubmit' | 'sendKey'
>;

/**
 * #489, #447: the one path text reaches a Claude Code session — Steward's
 * nudge, the trailer guard's notice and a person's message. The pane is
 * read first: the text goes in with `send-keys -l`, then `C-m` in a call of
 * its own (#189), only at an input box. `idleOnly` (Steward) types at an
 * empty, idle prompt alone; a person's message is also typed while the
 * agent works, and Claude Code queues it for its next step (M3). A question
 * selector, a dialog or a permission prompt gets nothing.
 */
export const deliverText = async (
  tmux: DeliveryTmux,
  session: string,
  text: string,
  options: { idleOnly?: boolean } = {},
  pacing: AnswerPacing = ANSWER_PACING,
): Promise<SessionMessageOutcome> => {
  const pane = await tmux.capture(session);
  if (pane === null) return 'no_session';
  const { state } = readPane(pane);
  if (state === 'question') return 'question';
  if (state !== 'idle' && (options.idleOnly || state !== 'busy')) {
    return 'not_at_input';
  }
  await tmux.sendLiteral(session, text);
  await pacing.sleep(pacing.settleMs);
  for (let submit = 0; submit < MAX_SUBMITS; submit += 1) {
    await tmux.sendSubmit(session);
    const left = await leftInBox(tmux, session, text, pacing);
    if (left === null) return 'no_session';
    if (!left) return 'sent';
  }
  return 'not_at_input';
};

/** C-433: a text is submitted at most this many times. */
const MAX_SUBMITS = 2;

/**
 * C-433: whether `text` is still typed in the input box after a submit. The
 * pane is read up to `pacing.reads` times, `settleMs` apart, and the first
 * read without the text ends it. `null` when the session is gone.
 */
const leftInBox = async (
  tmux: DeliveryTmux,
  session: string,
  text: string,
  pacing: AnswerPacing,
): Promise<boolean | null> => {
  const typed = text.replace(/\s+/g, ' ').trim();
  for (let read = 0; read < pacing.reads; read += 1) {
    await pacing.sleep(pacing.settleMs);
    const pane = await tmux.capture(session);
    if (pane === null) return null;
    const box = inputText(pane).replace(/\s+/g, ' ');
    // The box may also show a placeholder: only the typed text's start counts.
    const length = Math.min(box.length, typed.length, 20);
    if (length === 0 || box.slice(0, length) !== typed.slice(0, length)) {
      return false;
    }
  }
  return true;
};

/** #967: how an answer waits for the selector to move on. */
export interface AnswerPacing {
  readonly sleep: (ms: number) => Promise<void>;
  /** The pause after typed text, so the Enter behind it is not read as part of it. */
  readonly settleMs: number;
  /** The pane is read this many times, `settleMs` apart, before Enter is pressed again. */
  readonly reads: number;
}

const ANSWER_PACING: AnswerPacing = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  settleMs: 150,
  reads: 10,
};

type Answer = { index: number } | { text: string };

/**
 * #967: whether the selector left the question `place` names — to the next
 * tab, the form's Submit screen, or away. `stuck` carries the screen when it
 * did not; null when the session is gone.
 */
const leftQuestion = async (
  tmux: DeliveryTmux,
  session: string,
  place: string,
  pacing: AnswerPacing,
): Promise<
  { moved: true } | { moved: false; screen: QuestionScreen } | null
> => {
  let screen: QuestionScreen | null = null;
  for (let read = 0; read < pacing.reads; read += 1) {
    await pacing.sleep(pacing.settleMs);
    const pane = await tmux.capture(session);
    if (pane === null) return null;
    screen = readQuestion(pane);
    if (!screen || screen.place !== place) return { moved: true };
  }
  return screen ? { moved: false, screen } : { moved: true };
};

/**
 * #489 M4: answers the question selector the pane shows — the option with
 * that number, or typed text in its "Other" field — with the keys
 * `answerSteps` fixes, only while the pane still shows the screen
 * `questionKey` names.
 *
 * #967: `answered` only once the selector has moved on. Typed text gets a
 * pause before its Enter; when the pane still shows the question with the
 * cursor where that Enter went, the Enter was not taken and is pressed
 * once more. A selector that stays is `not_at_input`.
 */
export const answerQuestion = async (
  tmux: DeliveryTmux,
  session: string,
  questionKey: string,
  answer: Answer,
  pacing: AnswerPacing = ANSWER_PACING,
): Promise<SessionMessageOutcome> => {
  const pane = await tmux.capture(session);
  if (pane === null) return 'no_session';
  if (readPane(pane).state !== 'question') return 'question_changed';
  const screen = readQuestion(pane);
  if (!screen || screen.question.key !== questionKey) {
    return 'question_changed';
  }
  const steps = answerSteps(screen, answer);
  const enterAt = answerRow(screen, answer);
  if (!steps || enterAt === null) return 'no_option';
  for (const step of steps) {
    if ('literal' in step) {
      await tmux.sendLiteral(session, step.literal);
      await pacing.sleep(pacing.settleMs);
    } else await tmux.sendKey(session, step.key);
  }
  for (let enter = 0; ; enter += 1) {
    const left = await leftQuestion(tmux, session, screen.place, pacing);
    if (left === null) return 'no_session';
    if (left.moved) return 'answered';
    if (enter > 0 || left.screen.cursor !== enterAt) return 'not_at_input';
    await tmux.sendKey(session, 'Enter');
  }
};
