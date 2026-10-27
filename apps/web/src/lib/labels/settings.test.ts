import { describe, expect, test } from 'bun:test';
import { BOARD_ERROR, LABEL_RULES_PER_PROJECT_MAX } from '@nautelle/shared';
import { ApiError } from '../api';
import {
  deleteConsequence,
  describeLabelError,
  hueName,
  hueOf,
  labelNameProblem,
  moved,
  nextFreeHue,
  ruleProblems,
  rulesChanged,
  rulesToDraft,
  rulesToRequest,
  switchesRequest,
} from './settings';

const rule = (id: string, pattern: string, labelId: string, position = 0) => ({
  id,
  pattern,
  labelId,
  position,
});

describe('label colours', () => {
  test('an out-of-range hue falls back to blue', () => {
    expect(hueOf(3)).toBe(3);
    expect(hueOf(0)).toBe(1);
    expect(hueOf(9)).toBe(1);
    expect(hueName(6)).toBe('Red');
  });

  test('a new label takes the least used hue, in palette order', () => {
    expect(nextFreeHue([])).toBe(1);
    expect(nextFreeHue([{ hue: 1 }, { hue: 2 }])).toBe(3);
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map((hue) => ({ hue }));
    expect(nextFreeHue([...all, { hue: 1 }])).toBe(2);
  });
});

describe('label names', () => {
  test('accepts a kebab name and refuses the rest', () => {
    expect(labelNameProblem('design-system', [])).toBeUndefined();
    expect(labelNameProblem('Design', [])).toBeDefined();
    expect(labelNameProblem('', [])).toBeDefined();
    expect(labelNameProblem('-dash', [])).toBeDefined();
  });

  test('refuses a name another label has', () => {
    expect(labelNameProblem('api', [{ name: 'api' }])).toBe(
      'Another label already has this name.',
    );
  });
});

describe('delete confirmation', () => {
  test('says how many cards lose the label', () => {
    expect(deleteConsequence('api', 0)).toStartWith('No card shows it.');
    expect(deleteConsequence('api', 1)).toStartWith(
      'It is removed from 1 card.',
    );
    expect(deleteConsequence('api', 7)).toStartWith(
      'It is removed from 7 cards.',
    );
  });
});

describe('path rule draft', () => {
  const saved = [rule('r1', 'apps/web/**', 'a'), rule('r2', 'docs/**', 'b', 1)];

  test('round-trips the saved rules and trims patterns on the way out', () => {
    const draft = rulesToDraft(saved);
    expect(draft.map((row) => row.key)).toEqual(['r1', 'r2']);
    expect(rulesChanged(draft, saved)).toBe(false);
    expect(
      rulesToRequest([{ key: 'x', pattern: ' docs/** ', labelId: 'b' }]),
    ).toEqual([{ pattern: 'docs/**', labelId: 'b' }]);
  });

  test('sees an edit, a reorder, an addition and a removal', () => {
    const draft = rulesToDraft(saved);
    expect(
      rulesChanged([{ ...draft[0]!, pattern: 'apps/**' }, draft[1]!], saved),
    ).toBe(true);
    expect(
      rulesChanged([{ ...draft[0]!, labelId: 'b' }, draft[1]!], saved),
    ).toBe(true);
    expect(rulesChanged(moved(draft, 0, 1), saved)).toBe(true);
    expect(
      rulesChanged([...draft, { key: 'n', pattern: 'x', labelId: 'a' }], saved),
    ).toBe(true);
    expect(rulesChanged([draft[0]!], saved)).toBe(true);
  });

  test('a trailing space is not a change', () => {
    const draft = rulesToDraft(saved);
    expect(
      rulesChanged(
        [{ ...draft[0]!, pattern: 'apps/web/** ' }, draft[1]!],
        saved,
      ),
    ).toBe(false);
  });

  test('flags an invalid pattern on its row', () => {
    const problems = ruleProblems([
      { key: 'ok', pattern: 'apps/**', labelId: 'a' },
      { key: 'bad', pattern: '', labelId: 'a' },
    ]);
    expect(problems.rows.has('ok')).toBe(false);
    expect(problems.rows.has('bad')).toBe(true);
    expect(problems.list).toBeUndefined();
  });

  test('flags a list longer than the project limit', () => {
    const draft = Array.from(
      { length: LABEL_RULES_PER_PROJECT_MAX + 1 },
      (_, i) => ({ key: `k${i}`, pattern: 'a/**', labelId: 'a' }),
    );
    expect(ruleProblems(draft).list).toContain(
      String(LABEL_RULES_PER_PROJECT_MAX),
    );
  });
});

describe('switchesRequest', () => {
  const saved = { issueOnRun: true, specOnRun: false, maxRunning: 3 };

  test('sends the saved required settings with the changed switch', () => {
    expect(switchesRequest(saved, { labelSuggest: false })).toEqual({
      issueOnRun: true,
      specOnRun: false,
      maxRunning: 3,
      labelSuggest: false,
    });
  });

  test('leaves the other switch out so the API keeps it', () => {
    expect(switchesRequest(saved, { labelPaths: true })).not.toHaveProperty(
      'labelSuggest',
    );
  });
});

describe('moved', () => {
  test('moves an item and stays inside the list', () => {
    expect(moved([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  test('does not change the list it is given', () => {
    const list = [1, 2, 3];
    moved(list, 0, 1);
    expect(list).toEqual([1, 2, 3]);
  });
});

describe('describeLabelError', () => {
  const failure = (status: number, code?: string, message = 'refused') =>
    new ApiError(status, code as ApiError['code'], message);

  test('names a taken label name', () => {
    expect(describeLabelError(failure(409, BOARD_ERROR.labelNameTaken))).toBe(
      'Another label already has this name.',
    );
  });

  test('passes the API message of a label refusal on', () => {
    expect(
      describeLabelError(
        failure(422, BOARD_ERROR.labelLimit, 'Too many labels.'),
      ),
    ).toBe('Too many labels.');
  });

  test('explains a vanished label and a missing role', () => {
    expect(describeLabelError(failure(404))).toContain('no longer exists');
    expect(describeLabelError(failure(403))).toContain('project admin');
  });
});
