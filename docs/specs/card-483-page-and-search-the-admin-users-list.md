# C-483: Page and search the Admin › Users list

## Why
Admin › Users loads every account four times (one unbounded call per status) and has no search.

## What
- GET /admin/users?status=&q=&cursor= → items, nextCursor, counts; 50 a page.
- One call per tab, search box and Load more.

## Done when
- e2e: paging, search, counts; operator 403.
- DemoFlow demo recorded.

Evidence: apps/api/src/admin/admin-users.service.ts:30-35; apps/web/src/app/admin/users/page.tsx:89-98

Spec: docs/specs/card-483-admin-users-paged-and-searchable.md
