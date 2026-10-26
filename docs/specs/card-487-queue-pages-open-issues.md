# C-487: The Queue pages its open issues instead of reading them all

Stack **S-20**, stage 1: after C-472, which also edits `queue.controller.ts` and the shared queue contracts.

## Summary
The Queue page loads `GET /projects/:id/queue?include=open`. Next to the ready queue, the API then returns **every** open issue of the repository in one answer. A repository with a thousand open issues makes the page and every refresh slow. This card pages the open issues. The ready queue, which the orchestrator keeps small, stays one read.

## Scope
**In:** the open-issues part of the queue read, the query DTO, the shared contract and the Incoming list on the web.
**Out:** the ready queue (`items`), approvals, and the orchestrator.

## Current behaviour
- [Confirmed] `apps/api/src/queue/queue-query.service.ts:78-135`: `queue()` reads every `queueStateRow` of the project and, with `includeOpen`, `others()`.
- [Confirmed] `queue-query.service.ts:230-249`: `others()` is an unbounded `issueCache.findMany` of open issues not in the queue, ordered by number ascending.
- [Confirmed] `apps/api/src/queue/dto.ts:22-31`: `QueueListQuery` has `state` and `include=open`, and no limit or cursor.
- [Confirmed] `apps/web/src/app/(app)/projects/[projectId]/queue/page.tsx:160` fetches `/queue?include=open`. The list is `incoming-list.tsx`.

## API
- `GET /projects/:projectId/queue/open?cursor=&q=` (new, member): `{ items: OpenIssueView[], nextCursor: string | null }`. Items are ordered by issue number descending (newest first), 50 a page. `q` matches the title or `#number`.
- `GET /projects/:projectId/queue` no longer takes `include=open`, and `others` leaves `QueueView`. Both are removed, not kept as deprecated: the web is their only caller.

## Decisions
- Page only what grows without bound. The ready queue is bounded by the ready label, so it stays whole. It is sorted by priority in memory (`comparePriority`), and a keyset over a computed priority would cost more than it saves.
- Newest first: the issue a person just filed is the one they look for.
- `cardNumber` is filled per page from the same `cards()` map (`queue-query.service.ts:209-220`), restricted to the page's numbers.

## UI
The Incoming list shows the first 50 with **Load more** and a search box, all glass-ui. There is no new layout.

## Acceptance criteria
- [ ] `queue.e2e.spec.ts`: 120 open issues give 50 + 50 + 20 over three pages, with no duplicates, newest first. `q=#7` finds issue 7.
- [ ] `queue.e2e.spec.ts` (authorization): a non-member gets 404 on `queue/open`.
- [ ] `GET /queue` answers in one read without `others`, and `include=open` is rejected by `forbidNonWhitelisted`.
- [ ] **Make a card** on a paged issue still works, and the row then shows **Open card**.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-queue-pages-open-issues.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens the Queue, searches an issue and loads more.

## Risks
- The demo data may hold fewer than 50 open issues. The demo then shows the search only; `apps/api/src/cli/demo-data.ts` may add issues.

## Open questions
- None.
