import { describe, expect, test } from 'bun:test';
import { SETTINGS_CATALOGUE, searchSettings } from './settings-search';
import { SETTINGS_SECTIONS } from './settings-sections';

describe('project settings search (C-395)', () => {
  test('"budget" finds the budget settings first, under Cost › Budget', () => {
    const found = searchSettings('budget');
    expect(found[0]).toMatchObject({
      item: 'budget',
      label: 'Budgets',
      where: 'Cost › Budget',
    });
    // The block's own name matches too; the settings it names lead.
    const labelHits = found.filter((entry) =>
      entry.label.toLowerCase().includes('budget'),
    );
    expect(found.slice(0, labelHits.length)).toEqual(labelHits);
  });

  test('"profile" finds the default and the orchestrator runtime profile', () => {
    const labels = searchSettings('profile').map((entry) => entry.label);
    expect(labels).toContain('Default runtime profile');
    expect(labels).toContain('Orchestrator runtime profile');
    expect(labels).toContain('UI profile');
  });

  test('matches help text and keywords, every word in any order', () => {
    expect(searchSettings('deleted every night')[0]?.label).toBe(
      'Retention (days)',
    );
    expect(searchSettings('PLUGIN claude')[0]).toMatchObject({
      item: 'sessions',
      label: 'Terminal → Board setup',
    });
    expect(searchSettings('profile budget')).toEqual([]);
  });

  test('an empty query finds nothing', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
  });

  test('every block of the page has at least one setting', () => {
    const blocks = new Set(SETTINGS_CATALOGUE.map((entry) => entry.item));
    for (const section of SETTINGS_SECTIONS) {
      for (const item of section.items) expect(blocks).toContain(item.id);
    }
  });
});
