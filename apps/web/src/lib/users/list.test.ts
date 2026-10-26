import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AdminUser, AdminUsersPage } from '@nautelle/shared';

const calls: string[] = [];
let pages: AdminUsersPage[] = [];
mock.module('../api', () => ({
  api: async (path: string) => {
    calls.push(path);
    const page = pages.shift();
    if (!page) throw new Error('no page queued');
    return page;
  },
}));

const { fetchAllUsers, fetchUsersPage } = await import('./list');

const counts = { pending: 0, active: 0, rejected: 0, disabled: 0 };
const user = (id: string) => ({ id }) as AdminUser;
const page = (ids: string[], nextCursor: string | null): AdminUsersPage => ({
  items: ids.map(user),
  nextCursor,
  counts,
});

beforeEach(() => {
  calls.length = 0;
  pages = [];
});

describe('fetchUsersPage', () => {
  test('sends only the status when there is no search or cursor', async () => {
    pages = [page([], null)];
    await fetchUsersPage({ status: 'active', q: '', cursor: null });
    expect(calls).toEqual(['/admin/users?status=active']);
  });

  test('adds the search and the cursor, encoded', async () => {
    pages = [page([], null)];
    await fetchUsersPage({ status: 'pending', q: 'a b', cursor: 'x_y' });
    expect(calls).toEqual(['/admin/users?status=pending&q=a+b&cursor=x_y']);
  });
});

describe('fetchAllUsers', () => {
  test('walks every page until there is no cursor', async () => {
    pages = [page(['a', 'b'], 'c1'), page(['c'], 'c2'), page(['d'], null)];
    const users = await fetchAllUsers('active');
    expect(users.map((u) => u.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(calls).toEqual([
      '/admin/users?status=active',
      '/admin/users?status=active&cursor=c1',
      '/admin/users?status=active&cursor=c2',
    ]);
  });

  test('an empty set is one call and no users', async () => {
    pages = [page([], null)];
    expect(await fetchAllUsers('disabled')).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
