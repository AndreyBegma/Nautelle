import { describe, expect, test } from 'bun:test';
import { MAX_LIVE_SUBSCRIPTIONS } from '@nautelle/shared';
import {
  LIVE_PROJECT_BUDGET,
  LIVE_SUBSCRIPTIONS_RESERVED,
  planLive,
} from './plan';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('planLive', () => {
  test('the budget leaves the reserve of the socket free', () => {
    expect(LIVE_PROJECT_BUDGET).toBe(40);
    expect(LIVE_PROJECT_BUDGET + LIVE_SUBSCRIPTIONS_RESERVED).toBe(
      MAX_LIVE_SUBSCRIPTIONS,
    );
  });

  test('a fixed or filtered project follows only its own topic', () => {
    expect(
      planLive({ projectId: 'p9', projectIds: ids(41), isAdmin: true }),
    ).toEqual({ topics: ['project:p9'], poll: false });
  });

  test('unassigned follows admin only', () => {
    expect(
      planLive({ unassigned: true, projectIds: ids(41), isAdmin: true }),
    ).toEqual({ topics: ['admin'], poll: false });
  });

  test('3 projects for an admin: three project topics plus admin, no poll', () => {
    expect(planLive({ projectIds: ids(3), isAdmin: true })).toEqual({
      topics: ['project:p0', 'project:p1', 'project:p2', 'admin'],
      poll: false,
    });
  });

  test('a member gets no admin topic', () => {
    expect(planLive({ projectIds: ids(2), isAdmin: false }).topics).toEqual([
      'project:p0',
      'project:p1',
    ]);
  });

  test('exactly the budget still follows live', () => {
    const plan = planLive({ projectIds: ids(40), isAdmin: true });
    expect(plan.poll).toBe(false);
    expect(plan.topics).toHaveLength(41);
  });

  test('past the budget: no subscriptions, poll instead', () => {
    expect(planLive({ projectIds: ids(41), isAdmin: true })).toEqual({
      topics: [],
      poll: true,
    });
  });

  test('no projects: admin still gets admin, a member nothing', () => {
    expect(planLive({ projectIds: [], isAdmin: true }).topics).toEqual([
      'admin',
    ]);
    expect(planLive({ projectIds: [], isAdmin: false })).toEqual({
      topics: [],
      poll: false,
    });
  });
});
