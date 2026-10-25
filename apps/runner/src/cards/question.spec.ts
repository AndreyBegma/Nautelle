import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  answerRow,
  answerSteps,
  matchQuestion,
  readQuestion,
} from './question';

// Captured from a Claude Code 2.1.301 pane (#473), each at a step of answering.
const fixture = (name: string): string =>
  readFileSync(join(import.meta.dir, '__fixtures__', `${name}.txt`), 'utf8');

const PERMISSION_PROMPT = `
 Bash command

   rm -rf node_modules

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for rm commands
   3. No, and tell Claude what to do differently (esc)

 Esc to cancel · Tab to amend
`;

describe('the question selector (#473)', () => {
  it('matches one question, wherever the cursor is', () => {
    expect(matchQuestion(fixture('ask-user-question'))).toEqual({
      key: 'glass-ui',
    });
    expect(matchQuestion(fixture('ask-user-question-moved'))).toEqual({
      key: 'glass-ui',
    });
  });

  it('matches several questions with one key, the review screen too', () => {
    const tab = matchQuestion(fixture('ask-user-questions-two'));
    expect(tab).toEqual({ key: 'Colour Size Submit' });
    expect(matchQuestion(fixture('ask-user-questions-review'))).toEqual(tab);
  });

  it('no longer matches once the person answered', () => {
    expect(matchQuestion(fixture('ask-user-question-answered'))).toBeNull();
  });

  it('never matches a permission prompt, scrollback or a plain pane', () => {
    expect(matchQuestion(PERMISSION_PROMPT)).toBeNull();
    expect(
      matchQuestion(
        `${fixture('ask-user-question')}\n● Done.\n\n❯ \n  ⏵⏵ auto mode on\n`,
      ),
    ).toBeNull();
    expect(matchQuestion('> working on the card')).toBeNull();
    expect(matchQuestion('')).toBeNull();
  });
});

describe('reading and answering the selector (#489 M4)', () => {
  it('reads the question, its options and the cursor of one question', () => {
    const screen = readQuestion(fixture('ask-user-question'));
    expect(screen).toEqual({
      question: {
        key: expect.stringMatching(/^[0-9a-f]{16}$/),
        header: 'glass-ui',
        text: 'SelectionBar is missing in glass-ui — what now?',
        options: [
          {
            index: 1,
            label: 'Add it to glass-ui',
            description: 'Write the component in glass-ui first',
          },
          {
            index: 2,
            label: 'Use a Toolbar',
            description: 'Compose it from the existing Toolbar',
          },
        ],
        other: true,
      },
      cursor: 1,
      otherIndex: 3,
      rows: [1, 2, 3, 4],
      place: expect.any(String),
      cursorLabel: 'Add it to glass-ui',
    });
    // The same screen with the cursor moved is the same question.
    const moved = readQuestion(fixture('ask-user-question-moved'));
    expect(moved?.cursor).toBe(2);
    expect(moved?.question).toEqual(screen?.question);
  });

  it('reads a tab of several questions, and the review screen without Other', () => {
    const tab = readQuestion(fixture('ask-user-questions-two'));
    expect(tab?.question.header).toBe('← Colour Size Submit →');
    expect(tab?.question.text).toBe('Which colour?');
    expect(tab?.question.options.map((o) => o.label)).toEqual(['Red', 'Blue']);
    const review = readQuestion(fixture('ask-user-questions-review'));
    expect(review?.question.text).toContain('Ready to submit your answers?');
    expect(review?.question.options.map((o) => o.label)).toEqual([
      'Submit answers',
      'Cancel',
    ]);
    expect(review?.question.other).toBe(false);
    expect(review?.question.key).not.toBe(tab?.question.key);
  });

  it('#913: reads a long quoted question at 80x24 with Other and Chat split by a rule', () => {
    // C-369's selector on Claude Code 2.1.310, as its 80x24 card pane showed it.
    const pane = fixture('ask-user-question-80x24');
    expect(matchQuestion(pane)).toEqual({ key: 'C-369 order' });
    const screen = readQuestion(pane);
    expect(screen).toEqual({
      question: {
        key: expect.stringMatching(/^[0-9a-f]{16}$/),
        header: 'C-369 order',
        text: [
          "C-368 hasn't landed yet: its draft PR #905 holds the card.demo command schema,",
          'the demoVideosEnabled setting, the demo secrets route and the upload route',
          'this card builds on. Building the runner side now means inventing those',
          'contracts and reworking them when C-368 merges. How should C-369 go ahead?',
        ].join('\n'),
        options: [
          {
            index: 1,
            label: 'Wait for C-368',
            description:
              'Stop now; run this card again once PR #905 has merged into develop',
          },
          {
            index: 2,
            label: 'Build against the draft',
            description:
              "Fetch C-368's branch and import its shared types as they are today",
          },
          {
            index: 3,
            label: 'Provisioning only',
            description:
              'Do the DemoFlow pinning and capability now, leave card.demo for later',
          },
        ],
        other: true,
      },
      cursor: 1,
      otherIndex: 4,
      rows: [1, 2, 3, 4, 5],
      place: expect.any(String),
      cursorLabel: 'Wait for C-368',
    });
    if (!screen) throw new Error('no question');
    expect(answerSteps(screen, { index: 3 })).toEqual([
      { key: 'Down' },
      { key: 'Down' },
      { key: 'Enter' },
    ]);
    expect(answerSteps(screen, { text: 'Wait, then rebase' })).toEqual([
      { key: 'Down' },
      { key: 'Down' },
      { key: 'Down' },
      { literal: 'Wait, then rebase' },
      { key: 'Enter' },
    ]);
    // 5 is "Chat about this", below the rule: never an answer.
    expect(answerSteps(screen, { index: 5 })).toBeNull();
  });

  it('ADR-0094: redacts a secret on the screen, in what it reports and in the key', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const pane = fixture('ask-user-question').replace(
      'SelectionBar is missing in glass-ui — what now?',
      `Push with ${token}?`,
    );
    const screen = readQuestion(pane);
    expect(screen?.question.text).toBe('Push with •••?');
    const other = readQuestion(pane.replace(token, `ghp_${'b'.repeat(36)}`));
    expect(other?.question.key).toBe(screen?.question.key);
  });

  it('reads nothing once answered, or from a permission prompt', () => {
    expect(readQuestion(fixture('ask-user-question-answered'))).toBeNull();
    expect(readQuestion(PERMISSION_PROMPT)).toBeNull();
  });

  it('moves the cursor to the option, then presses Enter', () => {
    const screen = readQuestion(fixture('ask-user-question'));
    const moved = readQuestion(fixture('ask-user-question-moved'));
    if (!screen || !moved) throw new Error('no question');
    expect(answerSteps(screen, { index: 2 })).toEqual([
      { key: 'Down' },
      { key: 'Enter' },
    ]);
    expect(answerSteps(screen, { index: 1 })).toEqual([{ key: 'Enter' }]);
    expect(answerSteps(moved, { index: 1 })).toEqual([
      { key: 'Up' },
      { key: 'Enter' },
    ]);
    expect(answerSteps(moved, { text: 'Neither' })).toEqual([
      { key: 'Down' },
      { literal: 'Neither' },
      { key: 'Enter' },
    ]);
  });

  it('answers no option the screen does not list', () => {
    const screen = readQuestion(fixture('ask-user-question'));
    const review = readQuestion(fixture('ask-user-questions-review'));
    if (!screen || !review) throw new Error('no question');
    // 3 is "Type something.", 4 "Chat about this": neither is an option.
    for (const index of [0, 3, 4, 9]) {
      expect(answerSteps(screen, { index })).toBeNull();
    }
    expect(answerSteps(review, { text: 'x' })).toBeNull();
  });
});

// Captured from a Claude Code 2.1.310 pane (#967): a form of two questions at
// 80x24, as a card session shows it, and a multi-select tab.
describe('a form of several questions (#967)', () => {
  it('still reads a tab when its key hints wrap at 80 columns', () => {
    for (const name of [
      'ask-user-questions-80x24-other',
      'ask-user-questions-80x24-typed',
      'ask-user-questions-multi-other-typed',
    ]) {
      expect(matchQuestion(fixture(name))).not.toBeNull();
      expect(readQuestion(fixture(name))).not.toBeNull();
    }
    const typed = readQuestion(fixture('ask-user-questions-80x24-typed'));
    // The wrapped line is no option's description.
    expect(typed?.question.options.at(-1)).toEqual({
      index: 3,
      label: 'At noon, in #team',
    });
  });

  it('names every tab of the form, whether answered, and the step', () => {
    const first = readQuestion(fixture('ask-user-questions-80x24-tab1'));
    expect(first?.question.text).toBe(
      'When should the daily digest go out, and to which channel should it be posted\nfor the team?',
    );
    expect(first?.question.form).toEqual({
      tabs: [
        { label: 'Digest time', answered: false },
        { label: 'Events', answered: false },
      ],
      step: 'question',
    });
    const second = readQuestion(fixture('ask-user-questions-80x24-tab2'));
    expect(second?.question.text).toBe('Which events count?');
    expect(second?.question.form?.tabs).toEqual([
      { label: 'Digest time', answered: true },
      { label: 'Events', answered: false },
    ]);
    expect(second?.question.key).not.toBe(first?.question.key);
    const review = readQuestion(fixture('ask-user-questions-80x24-review'));
    expect(review?.question.form?.step).toBe('submit');
    expect(review?.question.options.map((o) => o.label)).toEqual([
      'Submit answers',
      'Cancel',
    ]);
    // One question has no form.
    expect(readQuestion(fixture('ask-user-question'))?.question.form).toBe(
      undefined,
    );
  });

  it('keeps the place of a tab while the person moves and types, and changes it with the tab', () => {
    const first = readQuestion(fixture('ask-user-questions-80x24-tab1'));
    const other = readQuestion(fixture('ask-user-questions-80x24-other'));
    const typed = readQuestion(fixture('ask-user-questions-80x24-typed'));
    expect(other?.place).toBe(first?.place);
    expect(typed?.place).toBe(first?.place);
    expect(typed?.cursor).toBe(3);
    expect(typed?.cursorLabel).toBe('At noon, in #team');
    for (const name of [
      'ask-user-questions-80x24-tab2',
      'ask-user-questions-80x24-review',
    ]) {
      expect(readQuestion(fixture(name))?.place).not.toBe(first?.place);
    }
  });

  it('reads a multi-select tab: its boxes, Other, and the Next row', () => {
    const screen = readQuestion(fixture('ask-user-questions-multi-first'));
    expect(screen?.question).toMatchObject({
      text: 'Which events?',
      multiSelect: true,
      other: true,
      options: [
        {
          index: 1,
          label: 'Started',
          description: 'The event that marks the beginning',
          checked: false,
        },
        {
          index: 2,
          label: 'Finished',
          description: 'The event that marks the completion',
          checked: false,
        },
      ],
    });
    expect(screen?.otherIndex).toBe(3);
    expect(screen?.rows).toEqual([1, 2, 3, 'next', 4]);
    const next = readQuestion(fixture('ask-user-questions-multi-next-row'));
    expect(next?.cursor).toBe('next');
    expect(next?.place).toBe(screen?.place);
    // The last tab's row reads Submit.
    expect(
      readQuestion(fixture('ask-user-questions-three-multi'))?.rows,
    ).toEqual([1, 2, 3, 'next', 4]);
  });

  it('ticks a multi-select option, or types Other, then presses Enter on Next', () => {
    const screen = readQuestion(fixture('ask-user-questions-multi-first'));
    if (!screen) throw new Error('no question');
    expect(answerSteps(screen, { index: 2 })).toEqual([
      { key: 'Down' },
      { key: 'Enter' },
      { key: 'Down' },
      { key: 'Down' },
      { key: 'Enter' },
    ]);
    expect(answerSteps(screen, { text: 'Merged' })).toEqual([
      { key: 'Down' },
      { key: 'Down' },
      { literal: 'Merged' },
      { key: 'Down' },
      { key: 'Enter' },
    ]);
    expect(answerRow(screen, { index: 2 })).toBe('next');
    // A box already ticked is not ticked off.
    const ticked = readQuestion(
      fixture('ask-user-questions-three-multi-toggled'),
    );
    if (!ticked) throw new Error('no question');
    expect(ticked.question.options[1]?.checked).toBe(true);
    expect(answerSteps(ticked, { index: 2 })).toEqual([
      { key: 'Down' },
      { key: 'Down' },
      { key: 'Enter' },
    ]);
  });
});
