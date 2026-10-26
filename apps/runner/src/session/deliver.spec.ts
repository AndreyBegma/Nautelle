import { describe, expect, it } from 'bun:test';
import { type AnswerPacing, type DeliveryTmux, deliverText } from './deliver';

const box = (text: string): string =>
  `\n● Done.\n\n╭────────────╮\n│ > ${text.padEnd(8)} │\n╰────────────╯\n`;

const PACING: AnswerPacing = {
  sleep: async () => {},
  settleMs: 0,
  reads: 2,
};

/** A pane that keeps the typed text for `keeps` submits, then clears it. */
const fakePane = (text: string, keeps: number) => {
  const calls: string[] = [];
  let submits = 0;
  const tmux: DeliveryTmux = {
    capture: async () =>
      box(calls.includes('literal') && submits <= keeps ? text : ''),
    sendLiteral: async () => {
      calls.push('literal');
    },
    sendSubmit: async () => {
      submits += 1;
      calls.push('submit');
    },
    sendKey: async () => {},
  };
  return { tmux, calls };
};

describe('deliverText (C-433)', () => {
  it('is sent after one submit when the box is empty', async () => {
    const { tmux, calls } = fakePane('hello there', 0);
    expect(await deliverText(tmux, 's', 'hello there', {}, PACING)).toBe(
      'sent',
    );
    expect(calls).toEqual(['literal', 'submit']);
  });

  it('presses submit once more when the text stays, then is sent', async () => {
    const { tmux, calls } = fakePane('hello there', 1);
    expect(await deliverText(tmux, 's', 'hello there', {}, PACING)).toBe(
      'sent',
    );
    expect(calls).toEqual(['literal', 'submit', 'submit']);
  });

  it('is not_at_input after two submits that leave the text', async () => {
    const { tmux, calls } = fakePane('hello there', 5);
    expect(await deliverText(tmux, 's', 'hello there', {}, PACING)).toBe(
      'not_at_input',
    );
    expect(calls).toEqual(['literal', 'submit', 'submit']);
  });
});
