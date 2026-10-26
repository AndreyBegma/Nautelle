import type { AdminUser, AdminUsersPage, UserStatus } from '@nautelle/shared';
import { api } from '../api';

/** One page of `GET /admin/users` for the Users page (C-483). */
export const fetchUsersPage = (params: {
  status: UserStatus;
  q?: string;
  cursor?: string | null;
}): Promise<AdminUsersPage> => {
  const query = new URLSearchParams({ status: params.status });
  if (params.q) query.set('q', params.q);
  if (params.cursor) query.set('cursor', params.cursor);
  return api<AdminUsersPage>(`/admin/users?${query.toString()}`);
};

/** Every account of one status, for pickers that need the whole set. */
export async function fetchAllUsers(status: UserStatus): Promise<AdminUser[]> {
  const users: AdminUser[] = [];
  let cursor: string | null = null;
  do {
    const page: AdminUsersPage = await fetchUsersPage({ status, cursor });
    users.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return users;
}
