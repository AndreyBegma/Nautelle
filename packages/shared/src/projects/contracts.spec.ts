import { describe, expect, it } from 'bun:test';
import type { Role } from '../auth';
import { effectiveProjectRole, projectRoleAtLeast } from './contracts';

describe('projectRoleAtLeast', () => {
  const cases: [Role, Role, boolean][] = [
    ['viewer', 'viewer', true],
    ['viewer', 'operator', false],
    ['viewer', 'admin', false],
    ['operator', 'viewer', true],
    ['operator', 'operator', true],
    ['operator', 'admin', false],
    ['admin', 'viewer', true],
    ['admin', 'operator', true],
    ['admin', 'admin', true],
  ];

  it.each(cases)('%s vs minimum %s -> %p', (role, minRole, expected) => {
    expect(projectRoleAtLeast(role, minRole)).toBe(expected);
  });
});

describe('effectiveProjectRole', () => {
  const cases: [Role, Role | null, Role][] = [
    ['viewer', null, 'viewer'],
    ['viewer', 'viewer', 'viewer'],
    ['viewer', 'operator', 'viewer'],
    ['viewer', 'admin', 'viewer'],
    ['operator', null, 'operator'],
    ['operator', 'viewer', 'viewer'],
    ['operator', 'operator', 'operator'],
    ['operator', 'admin', 'operator'],
    ['admin', null, 'admin'],
    ['admin', 'viewer', 'viewer'],
    ['admin', 'operator', 'operator'],
    ['admin', 'admin', 'admin'],
  ];

  it.each(
    cases,
  )('global %s, override %p -> %s', (globalRole, override, expected) => {
    expect(effectiveProjectRole(globalRole, override)).toBe(expected);
  });
});
