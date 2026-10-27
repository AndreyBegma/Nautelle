import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionMessageInput } from '@nautelle/shared';
import { readQuestion } from '../cards/question';
import type { CardRecord } from '../cards/record';
import { createExec } from '../detect/exec';
import { FakeClock } from '../testing/fake-clock';
import { memoryLogger, tempDir } from '../testing/fixtures';
import { REAL_PROCESS_TIMEOUT_MS } from '../testing/projects';
import { releaseTmuxServer } from '../testing/tmux';
import { SessionMessenger } from './messenger';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS * 2);

/**
 * #489 against a real tmux on a private server: a pane shows a captured
 * Claude Code screen, and a script records every byte the session receives
 * in raw mode — the keys `session.message` sent, exactly. #967: each Enter
 * the session receives draws the next captured screen, as Claude Code moves
 * through a form; with none left, the screen stays.
 */
const tmuxInstalled = Bun.which('tmux') !== null;
const FIXTURES = join(import.meta.dir, '..', 'cards', '__fixtures__');
const SESSION = 'nautelle-card-ab12cd34';
const fixturePath = (name: string): string => join(FIXTURES, `${name}.txt`);

// Shows the first screen, records raw input byte by byte, and shows the next
// screen on every Enter, until the session is killed.
const SCREEN = `#!/bin/sh
keys="$1"; shift
show() { printf '\\033[2J\\033[H'; cat "$1"; }
show "$1"; shift
: > "$keys"
stty raw -echo opost onlcr
cr=$(printf '\\r')
while :; do
  c=$(dd bs=1 count=1 2>/dev/null)
  [ -z "$c" ] && continue
  printf '%s' "$c" >> "$keys"
  if [ "$c" = "$cr" ] && [ $# -gt 0 ]; then show "$1"; shift; fi
done
`;

const BUSY_SCREEN = `
● Reading the board…

✻ Working… (12s · ↓ 1.2k tokens · esc to interrupt)

╭──────────────────────────────────────────╮
│ >                                        │
╰──────────────────────────────────────────╯
`;

let teardown: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of teardown.reverse()) await fn();
  teardown = [];
});

const setup = async (...screenFiles: string[]) => {
  const t = tempDir();
  const server = `agentdock-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const tmuxServer = ['-L', server];
  teardown.push(async () => {
    await releaseTmuxServer(tmuxServer);
    t.cleanup();
  });
  const script = join(t.dir, 'screen.sh');
  writeFileSync(script, SCREEN);
  chmodSync(script, 0o755);
  const keys = join(t.dir, 'keys');
  const exec = createExec(process.env);
  const tmux = (...args: string[]) => exec('tmux', [...tmuxServer, ...args]);
  await tmux(
    'new-session',
    '-d',
    '-s',
    SESSION,
    '-x',
    '120',
    '-y',
    '50',
    script,
    keys,
    ...screenFiles,
  );
  const record = {
    cardId: 'card_1',
    projectId: 'prj_1',
    runId: 'run_1',
  } as CardRecord;
  const messenger = new SessionMessenger({
    cards: {
      record: (cardId) => (cardId === record.cardId ? record : null),
      liveSession: () => SESSION,
    },
    exec,
    clock: new FakeClock(Date.parse('2026-10-16T12:00:00.000Z')),
    watchedProjects: () => [{ id: 'prj_1', root: t.dir }],
    log: memoryLogger().log,
    tmuxServer,
  });
  const pane = async () =>
    (await tmux('capture-pane', '-p', '-t', `=${SESSION}:`))?.stdout ?? '';
  // The screen is drawn, and the script has switched the tty to raw mode.
  for (let i = 0; i < 400 && (await pane()).trim() === ''; i++) {
    await Bun.sleep(25);
  }
  await Bun.sleep(100);
  const send = (message: SessionMessageInput) =>
    messenger.message({
      projectId: 'prj_1',
      target: { kind: 'card_round', cardId: 'card_1', runId: 'run_1' },
      message,
    });
  /** The bytes the session received, once they hold `enters` Enters (`\r`). */
  const received = async (enters = 1): Promise<string> => {
    const read = () => (existsSync(keys) ? readFileSync(keys, 'latin1') : '');
    const count = () => read().split('\r').length - 1;
    for (let i = 0; i < 400 && count() < enters; i++) {
      await Bun.sleep(25);
    }
    return read();
  };
  const receivedNothing = async (): Promise<string> => {
    await Bun.sleep(300);
    return existsSync(keys) ? readFileSync(keys, 'latin1') : '';
  };
  return { send, received, receivedNothing, messenger, dir: t.dir };
};

const DOWN = '\u001b[B';
const UP = '\u001b[A';

describe.skipIf(!tmuxInstalled)('session.message on a real pane (#489)', () => {
  it('M4: option 2 moves the cursor down once and presses Enter', async () => {
    const t = await setup(
      fixturePath('ask-user-question'),
      fixturePath('ask-user-question-answered'),
    );
    const { readQuestion } = await import('../cards/question');
    const key = readQuestion(
      readFileSync(join(FIXTURES, 'ask-user-question.txt'), 'utf8'),
    )?.question.key;
    if (!key) throw new Error('the fixture shows no question');
    expect(
      await t.send({ kind: 'option', questionKey: key, index: 2 }),
    ).toEqual({ outcome: 'answered' });
    expect(await t.received()).toBe(`${DOWN}\r`);
  });

  it('M4: with the cursor on option 2, option 1 moves up', async () => {
    const t = await setup(
      fixturePath('ask-user-question-moved'),
      fixturePath('ask-user-question-answered'),
    );
    const { readQuestion } = await import('../cards/question');
    const key = readQuestion(
      readFileSync(join(FIXTURES, 'ask-user-question-moved.txt'), 'utf8'),
    )?.question.key;
    if (!key) throw new Error('the fixture shows no question');
    expect(
      await t.send({ kind: 'option', questionKey: key, index: 1 }),
    ).toEqual({ outcome: 'answered' });
    expect(await t.received()).toBe(`${UP}\r`);
  });

  it('M4: "Other" moves to "Type something.", types the text and presses Enter', async () => {
    const t = await setup(
      fixturePath('ask-user-question'),
      fixturePath('ask-user-question-answered'),
    );
    const { readQuestion } = await import('../cards/question');
    const key = readQuestion(
      readFileSync(join(FIXTURES, 'ask-user-question.txt'), 'utf8'),
    )?.question.key;
    if (!key) throw new Error('the fixture shows no question');
    expect(
      await t.send({ kind: 'other', questionKey: key, text: 'Use a Popover' }),
    ).toEqual({ outcome: 'answered' });
    expect(await t.received()).toBe(`${DOWN}${DOWN}Use a Popover\r`);
  });

  it('sends nothing for an answer to a screen the pane no longer shows, or text over a selector', async () => {
    const t = await setup(fixturePath('ask-user-question'));
    expect(
      await t.send({
        kind: 'option',
        questionKey: '0000000000000000',
        index: 2,
      }),
    ).toEqual({ outcome: 'question_changed' });
    expect(await t.send({ kind: 'text', text: 'hello' })).toEqual({
      outcome: 'question',
    });
    expect(await t.receivedNothing()).toBe('');
  });

  it('M3: text to a busy session is typed and submitted, for Claude Code to queue', async () => {
    const t0 = tempDir();
    teardown.push(async () => t0.cleanup());
    const screen = join(t0.dir, 'busy.txt');
    writeFileSync(screen, BUSY_SCREEN);
    const t = await setup(screen);
    expect(
      await t.send({ kind: 'text', text: 'Also update the changelog' }),
    ).toEqual({ outcome: 'sent' });
    expect(await t.received()).toBe('Also update the changelog\r');
  });

  it('C-433: text left in the box gets a second Enter, and is sent only once the box is empty', async () => {
    const t0 = tempDir();
    teardown.push(async () => t0.cleanup());
    const [empty, typed] = ['empty', 'typed'].map((name, i) => {
      const file = join(t0.dir, `${name}.txt`);
      const text = i === 0 ? '' : 'Also update the changelog';
      writeFileSync(
        file,
        `\n● Done.\n\n╭─────────╮\n│ > ${text} │\n╰─────────╯\n`,
      );
      return file;
    }) as [string, string];
    // The first Enter leaves the text in the box, the second submits it.
    const t = await setup(empty, typed, empty);
    expect(
      await t.send({ kind: 'text', text: 'Also update the changelog' }),
    ).toEqual({ outcome: 'sent' });
    expect(await t.received(2)).toBe('Also update the changelog\r\r');
  });

  it('C-433: text that two Enters leave in the box is not_at_input', async () => {
    const t0 = tempDir();
    teardown.push(async () => t0.cleanup());
    const empty = join(t0.dir, 'empty.txt');
    const typed = join(t0.dir, 'typed.txt');
    writeFileSync(empty, '\n● Done.\n\n╭─────╮\n│ >   │\n╰─────╯\n');
    writeFileSync(
      typed,
      '\n● Done.\n\n╭─────╮\n│ > Also update the changelog │\n╰─────╯\n',
    );
    const t = await setup(empty, typed, typed);
    expect(
      await t.send({ kind: 'text', text: 'Also update the changelog' }),
    ).toEqual({ outcome: 'not_at_input' });
    expect(await t.received(2)).toBe('Also update the changelog\r\r');
  });

  it('sends nothing to a permission prompt', async () => {
    const t0 = tempDir();
    teardown.push(async () => t0.cleanup());
    const screen = join(t0.dir, 'permission.txt');
    writeFileSync(
      screen,
      ' Bash command\n\n   rm -rf node_modules\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. No, and tell Claude what to do differently (esc)\n',
    );
    const t = await setup(screen);
    expect(await t.send({ kind: 'text', text: 'yes' })).toEqual({
      outcome: 'not_at_input',
    });
    expect(await t.receivedNothing()).toBe('');
  });
});

const keyOf = (name: string): string => {
  const key = readQuestion(readFileSync(fixturePath(name), 'utf8'))?.question
    .key;
  if (!key) throw new Error(`${name} shows no question`);
  return key;
};

describe.skipIf(!tmuxInstalled)(
  'a form of several questions on a real pane (#967)',
  () => {
    it('answers a two-question form end to end: Other on tab 1, an option on tab 2, then Submit', async () => {
      const t = await setup(
        fixturePath('ask-user-questions-80x24-tab1'),
        fixturePath('ask-user-questions-80x24-tab2'),
        fixturePath('ask-user-questions-80x24-review'),
        fixturePath('ask-user-question-answered'),
      );
      expect(
        await t.send({
          kind: 'other',
          questionKey: keyOf('ask-user-questions-80x24-tab1'),
          text: 'At noon, in #team',
        }),
      ).toEqual({ outcome: 'answered' });
      expect(
        await t.send({
          kind: 'option',
          questionKey: keyOf('ask-user-questions-80x24-tab2'),
          index: 2,
        }),
      ).toEqual({ outcome: 'answered' });
      expect(
        await t.send({
          kind: 'option',
          questionKey: keyOf('ask-user-questions-80x24-review'),
          index: 1,
        }),
      ).toEqual({ outcome: 'answered' });
      expect(await t.received(3)).toBe(
        `${DOWN}${DOWN}At noon, in #team\r${DOWN}\r\r`,
      );
    });

    it('presses Enter once more when typed Other text stays in its field', async () => {
      // The first Enter leaves the text typed in the field (C-404).
      const t = await setup(
        fixturePath('ask-user-questions-80x24-tab1'),
        fixturePath('ask-user-questions-80x24-typed'),
        fixturePath('ask-user-questions-80x24-tab2'),
      );
      expect(
        await t.send({
          kind: 'other',
          questionKey: keyOf('ask-user-questions-80x24-tab1'),
          text: 'At noon, in #team',
        }),
      ).toEqual({ outcome: 'answered' });
      expect(await t.received(2)).toBe(`${DOWN}${DOWN}At noon, in #team\r\r`);
    });

    it('is not_at_input when the selector stays on the question', async () => {
      const t = await setup(
        fixturePath('ask-user-questions-80x24-tab1'),
        fixturePath('ask-user-questions-80x24-typed'),
      );
      expect(
        await t.send({
          kind: 'other',
          questionKey: keyOf('ask-user-questions-80x24-tab1'),
          text: 'At noon, in #team',
        }),
      ).toEqual({ outcome: 'not_at_input' });
      expect(await t.received(2)).toBe(`${DOWN}${DOWN}At noon, in #team\r\r`);
    });

    it('ticks a multi-select option and moves to the next tab with Next', async () => {
      const t = await setup(
        fixturePath('ask-user-questions-multi-first'),
        fixturePath('ask-user-questions-multi-first'),
        fixturePath('ask-user-questions-multi-second'),
      );
      expect(
        await t.send({
          kind: 'option',
          questionKey: keyOf('ask-user-questions-multi-first'),
          index: 2,
        }),
      ).toEqual({ outcome: 'answered' });
      expect(await t.received(2)).toBe(`${DOWN}\r${DOWN}${DOWN}\r`);
    });
  },
);
