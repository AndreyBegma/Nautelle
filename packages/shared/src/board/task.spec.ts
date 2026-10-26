import { describe, expect, it } from 'bun:test';
import { isTaskCard, mayActOnTask } from './task';

describe('isTaskCard', () => {
  it('is true only for the task kind', () => {
    expect(isTaskCard({ kind: 'task' })).toBe(true);
    for (const kind of ['feature', 'bug', 'analysis'] as const) {
      expect(isTaskCard({ kind })).toBe(false);
    }
  });
});

describe('mayActOnTask (C-509 D5)', () => {
  it('lets an operator or admin act on any task', () => {
    for (const role of ['operator', 'admin'] as const) {
      expect(mayActOnTask(role, 'u1', { assigneeId: 'u2' })).toBe(true);
      expect(mayActOnTask(role, 'u1', { assigneeId: null })).toBe(true);
    }
  });

  it('lets a viewer act only on a task assigned to them', () => {
    expect(mayActOnTask('viewer', 'u1', { assigneeId: 'u1' })).toBe(true);
    expect(mayActOnTask('viewer', 'u1', { assigneeId: 'u2' })).toBe(false);
    expect(mayActOnTask('viewer', 'u1', { assigneeId: null })).toBe(false);
  });
});
