# C-364: Make the Board page load fast

Issue: #933

## What to do
The Board page (`apps/web/src/app/(app)/projects/[projectId]/board/page.tsx`) stays on its loading skeleton for a long time before the columns appear. Find out where the time goes, then fix it.

First measure: time `GET /projects/:id/board` (`BoardService.board`, `apps/api/src/board/board.service.ts`) and the requests the page sends alongside it (`fetchPlanTasks`, `fetchTriageCounts`), on a project with a realistic number of cards (the Nautelle project itself). Record the numbers before and after the fix in the pull request.

Likely suspects, to confirm or rule out by measurement:
- `board()` loads every round of every open card, plus the Completed page, with all columns (`include: { rounds: ... }`). That includes large text and JSON fields (`cardBody`, `feedback`, `summary`, `cardAttachments`, `pendingQuestion`, `restartEstimate`), even though the card face needs only a few of them. Select only what `toCardView` and `facts` actually read (for example, just the latest round's fields the face uses), or add a narrower query.
- `facts(...)`, `running(...)`, `work.project(...)` and `stacks.views(...)` run after the card queries rather than with them. Run independent reads in parallel and check that none of them has N+1 queries.
- Missing database indexes for the board's `where`/`orderBy` (`projectId` + `column`, `position`, `completedAt`). If one is needed, add it with a `prisma migrate dev` migration that has a descriptive name.
- On the web side, check that the columns are not blocked on the slower plan-tasks or triage requests, and that live `board.changed` refetches (debounced in `page.tsx`) do not pile up.

Keep the `BoardView` contract in `packages/shared` unchanged unless a field the web does not use can be dropped safely.

## Acceptance criteria
- [ ] Opening the Board of the Nautelle project no longer stays on the skeleton for a long time: columns render within about 1 s on the dev/staging stack (the reproduction no longer reproduces).
- [ ] The pull request states the measured `GET /board` time (and its payload size) before and after the change.
- [ ] `GET /board` loads only the round fields the card face needs; the full round history and the large text/JSON fields stay on `GET /board/cards/:number`.
- [ ] Independent reads in `BoardService.board` run in parallel; there is no per-card query in a loop.
- [ ] Card faces, column counts, the Completed "load older" pagination, stacks, running state and the Inbox visibility rule for viewers (#244 D8) behave exactly as before.
- [ ] A `board.service.spec.ts` test fixes the narrowed query shape (round fields selected) so a future change cannot quietly bring back the full round load.
- [ ] `bun run check` and the api tests pass.

## Out of scope
- Redesigning the Board UI or changing the loading skeleton's look.
- Optimising the card detail page, the stack page or other screens.
- Adding a cache layer (Redis, HTTP cache) — fix the queries first.

## Open questions
- What counts as "fast"? Default: Board columns visible within about 1 s on the Nautelle project; if the measurement shows a different bottleneck (network, runner), fix the largest one and report the rest in the pull request.
