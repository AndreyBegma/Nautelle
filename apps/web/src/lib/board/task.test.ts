import { describe, expect, test } from 'bun:test';
import {
  checklistLines,
  doneConfirmText,
  taskLine,
  taskProgress,
  unticked,
} from './task';

const anna = { id: 'u1', name: 'Anna' };

describe('task cards (C-510)', () => {
  test('the face line follows the person', () => {
    expect(taskLine({ column: 'todo', assignee: anna })).toBe(
      'Waiting on Anna',
    );
    expect(
      taskLine({
        column: 'todo',
        assignee: anna,
        checklist: { done: 1, total: 4 },
      }),
    ).toBe('Anna is on it');
    expect(taskLine({ column: 'in_progress', assignee: anna })).toBe(
      'Anna is on it',
    );
    expect(taskLine({ column: 'completed', assignee: anna })).toBe(
      'Done by Anna',
    );
    expect(taskLine({ column: 'todo', assignee: null })).toBe('Unassigned');
    expect(taskLine({ column: 'completed', assignee: null })).toBe('Done');
  });

  test('progress is shown only with a checklist', () => {
    expect(taskProgress({ checklist: { done: 2, total: 4 } })).toBe('2/4');
    expect(taskProgress({ checklist: null })).toBeNull();
    expect(taskProgress({})).toBeNull();
  });

  test('Done counts the unticked items', () => {
    const items = [
      { doneAt: null },
      { doneAt: '2026-01-01' },
      { doneAt: null },
    ];
    expect(unticked(items)).toBe(2);
    expect(doneConfirmText(1)).toContain('1 checklist item is not ticked');
    expect(doneConfirmText(2)).toContain('2 checklist items are not ticked');
  });

  test('checklist lines are trimmed and blank ones dropped', () => {
    expect(checklistLines(' one \r\n\n two\n   \n')).toEqual(['one', 'two']);
  });
});
