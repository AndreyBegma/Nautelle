import { describe, expect, test } from 'bun:test';
import type { CardLabelView } from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { LabelChips } from './card-labels';

const chip = (
  name: string,
  source: CardLabelView['source'] = 'person',
): CardLabelView => ({ id: name, name, hue: 2, source });

describe('LabelChips (C-499)', () => {
  test('a chip per label, in order', () => {
    const html = renderToStaticMarkup(
      <LabelChips chips={[chip('frontend'), chip('backend')]} />,
    );
    expect(html.indexOf('frontend')).toBeLessThan(html.indexOf('backend'));
  });

  test("only an automatic label carries the 'auto' marker", () => {
    const person = renderToStaticMarkup(<LabelChips chips={[chip('docs')]} />);
    expect(person).not.toContain('data-label-auto');
    const auto = renderToStaticMarkup(
      <LabelChips chips={[chip('docs', 'paths'), chip('infra', 'model')]} />,
    );
    expect(auto.match(/data-label-auto/g)).toHaveLength(2);
    expect(auto).toContain('auto');
  });

  test('no labels says so', () => {
    expect(renderToStaticMarkup(<LabelChips chips={[]} />)).toContain(
      'No labels.',
    );
  });
});
