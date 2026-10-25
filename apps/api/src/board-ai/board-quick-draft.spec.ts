import { BOARD_CARD_TITLE_MAX } from '@nautelle/shared';
import { parseQuickDraft } from './board-quick-draft.service';

describe('parseQuickDraft', () => {
  it('reads a title and a kind', () => {
    expect(
      parseQuickDraft({ title: 'Fix the login redirect', kind: 'bug' }),
    ).toEqual({
      title: 'Fix the login redirect',
      kind: 'bug',
      source: 'model',
    });
  });

  it('takes a feature for any other kind', () => {
    expect(
      parseQuickDraft({ title: 'Add dark mode', kind: 'chore' })?.kind,
    ).toBe('feature');
    expect(parseQuickDraft({ title: 'Add dark mode' })?.kind).toBe('feature');
  });

  it('keeps one line, within the title limit', () => {
    const draft = parseQuickDraft({
      title: `  ${'x'.repeat(BOARD_CARD_TITLE_MAX + 50)}\nsecond line`,
      kind: 'feature',
    });
    expect(draft?.title).toHaveLength(BOARD_CARD_TITLE_MAX);
  });

  it('refuses an answer out of contract', () => {
    expect(parseQuickDraft(null)).toBeNull();
    expect(parseQuickDraft('title')).toBeNull();
    expect(parseQuickDraft({ kind: 'bug' })).toBeNull();
    expect(parseQuickDraft({ title: '   ', kind: 'bug' })).toBeNull();
  });
});
