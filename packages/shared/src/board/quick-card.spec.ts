import { describe, expect, it } from 'bun:test';
import {
  QUICK_CARD_FALLBACK_TITLE_MAX,
  quickCardFallbackTitle,
} from './quick-card';

describe('quickCardFallbackTitle', () => {
  it('is the first non-blank line', () => {
    expect(quickCardFallbackTitle('\n  \n Fix the footer \nmore')).toBe(
      'Fix the footer',
    );
  });

  it('is empty for blank text', () => {
    expect(quickCardFallbackTitle('  \n ')).toBe('');
  });

  it('cuts a long line with an ellipsis', () => {
    const title = quickCardFallbackTitle('a'.repeat(300));
    expect(title).toHaveLength(QUICK_CARD_FALLBACK_TITLE_MAX);
    expect(title.endsWith('…')).toBe(true);
  });
});
