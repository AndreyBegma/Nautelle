import { describe, expect, test } from 'bun:test';
import type { BoardCardView } from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { card, round } from '../../lib/board/fixtures';
import { CardSignals } from './card-signals';

const render = (extra: Partial<BoardCardView> = {}) =>
  renderToStaticMarkup(<CardSignals card={card(7, 'in_progress', extra)} />);

describe('CardSignals (C-392)', () => {
  test('a card with none of them draws an empty row', () => {
    expect(render()).not.toContain('<span');
  });

  test('keeps what the board tile no longer shows', () => {
    const html = render({
      autoRunWhenReady: true,
      restartMode: 'resume',
      ciState: 'red',
      ciFixAttempts: 1,
      round: round('running'),
      source: 'fleet',
      fleet: { issue: 12, slot: 'i12-web', stage: 'pr_open', slotGone: true, detached: false },
    });
    expect(html).toContain('Auto-run');
    expect(html).toContain('resumed session');
    expect(html).toContain('Fixing CI (1/3)');
    expect(html).toContain('Fleet');
    expect(html).toContain('Slot gone');
  });

  test('keeps the usage-limit wait line', () => {
    expect(
      render({
        round: round('running', {
          quotaWait: { limit: 'weekly', resetsAt: null },
        }),
      }),
    ).toContain('Limit reached');
  });

  test('keeps the terminal and taken badges', () => {
    const html = render({
      source: 'terminal',
      tracking: { sessionId: 's-1', alive: true },
      autoCollect: true,
      taken: { sessionId: 'abcdef123456', alive: false, branch: null },
    });
    expect(html).toContain('Terminal');
    expect(html).toContain('Automatic work');
    expect(html).toContain('taken by abcdef12');
    expect(html).toContain('session ended');
  });
});
