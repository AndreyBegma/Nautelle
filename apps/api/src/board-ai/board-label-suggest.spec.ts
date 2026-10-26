import { parseSuggestedLabels } from './board-label-suggest.service';

const KNOWN = ['frontend', 'backend', 'docs'];

describe('parseSuggestedLabels', () => {
  it('names the labels of the project, as the project spells them', () => {
    expect(
      parseSuggestedLabels({ labels: [' Frontend ', 'DOCS'] }, KNOWN),
    ).toEqual(['frontend', 'docs']);
  });

  it('drops unknown names, non-strings and repeats', () => {
    expect(
      parseSuggestedLabels(
        { labels: ['nonsense', 7, null, 'docs', 'docs'] },
        KNOWN,
      ),
    ).toEqual(['docs']);
  });

  it('keeps at most two', () => {
    expect(
      parseSuggestedLabels({ labels: ['frontend', 'backend', 'docs'] }, KNOWN),
    ).toEqual(['frontend', 'backend']);
  });

  it('names none for an answer out of contract', () => {
    expect(parseSuggestedLabels(null, KNOWN)).toEqual([]);
    expect(parseSuggestedLabels('frontend', KNOWN)).toEqual([]);
    expect(parseSuggestedLabels({ labels: 'frontend' }, KNOWN)).toEqual([]);
    expect(parseSuggestedLabels({}, KNOWN)).toEqual([]);
  });
});
