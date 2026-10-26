# C-483: Admin › Users pages and searches its list

Stack **S-20**, stage 0.

## Summary
Admin › Users loads every account four times over, once per status tab, each call unbounded, and filters in the browser. There is no search. A team of a few hundred accounts makes the page slow, and finding one person means scrolling.

## Scope
**In:** `GET /admin/users` (paging, search, counts) and `apps/web/src/app/admin/users/page.tsx`.
**Out:** approve, reject, disable, reset links and roles: the row actions stay as they are.

## Current behaviour
- [Confirmed] `apps/api/src/admin/admin-users.service.ts:30-35`: `list(status?)` is `user.findMany` with no `take`, ordered by `createdAt` ascending.
- [Confirmed] `apps/web/src/app/admin/users/page.tsx:89-98`: `Promise.all(USER_STATUSES.map(s => api(/admin/users?status=s)))`, flattened, then filtered by the `?tab=` status (`:114`).

## API
`GET /admin/users?status=&q=&cursor=` (admin) → `{ items: AdminUser[]; nextCursor: string | null; counts: Record<UserStatus, number> }`.
- 50 items a page, keyset `(createdAt, id)`. Pending is ordered oldest first (who waited longest); every other status newest first.
- `q`, trimmed, at most 100 characters, matches the email or name case-insensitively (`contains`, `mode: 'insensitive'`).
- `counts` comes from one `groupBy` on status and ignores `q`, so the tabs always show totals.

## Decisions
- One call per tab view, not four. The tab badges come from `counts`.
- The old unpaged response shape goes. The web is its only caller; it changes in the same PR.
- The search box and **Load more** are glass-ui (`Input`, `Button`). There is no new layout.

## Acceptance criteria
- [ ] `apps/api/src/admin/admin.e2e.spec.ts`: 120 active users page as 50 + 50 + 20 with no duplicates. `q=ann` finds "Ann" and "joanne@…". `counts` equals the totals per status.
- [ ] `apps/api/src/admin/admin.e2e.spec.ts` (authorization): an operator gets 403.
- [ ] The page makes one `/admin/users` call per tab switch. The tab badges show the counts.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-admin-users-paged-search.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Admin › Users, searches a name and switches to Pending.

## Risks
- None worth naming.

## Open questions
- None.
