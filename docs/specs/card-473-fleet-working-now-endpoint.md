# C-473: Fleet's Working now reads a small endpoint, not the whole Board (ADR-0122)

Stack **S-20**, stage 0.

## Summary
The Fleet page loads the project's whole Board read model only to build **Working now**. That is every column, card face, attachment count and dependency. It loads it again on every `board.changed` and `fleet` push. ADR-0098 §2 chose this ("no new endpoint") because the Board already carries what Working now shows. The Board has since become the heaviest read in the app (C-364, C-933). This card adds a read of only the cards that are being worked and records the change as ADR-0122, which amends ADR-0098 §2.

## Scope
**In:** a new API read, the Fleet page and `apps/web/src/lib/fleet/working-now.ts`, and ADR-0122.
**Out:** the Board page and `GET /board`, the slot table and the agent canvas.

## Current behaviour
- [Confirmed] `apps/web/src/app/(app)/projects/[projectId]/fleet/page.tsx:202-210`: `useSection(() => fetchBoard(projectId), [projectId, version, boardVersion])`, then `workingNow(board.data)`.
- [Confirmed] `apps/web/src/lib/fleet/working-now.ts:49-99,108-118`: a row comes from a card that has one of the following:
  - an active round on its own worker;
  - a live fleet slot (not gone, not completed);
  - a live tracking or taken session;
  - a run-queue place in To Do.

  Rows from the Inbox column are skipped.
- [Confirmed] The Fleet page's first-project checklist reads the graph and the fleet, not the Board (`page.tsx:257-267`).
- [Confirmed] ADR-0098 §2 and its "Rejected: A server endpoint for Working now".

## API
`GET /projects/:projectId/fleet/working` (member) → `{ projectId: string; cards: BoardCardView[] }`. The cards match the same four conditions as `rowsOf`, each mapped with the Board's own card mapper (`apps/api/src/board/board-mapper.ts`) so the faces agree. A viewer gets no captured cards, as on the Board (`apps/api/src/board/inbox-access.ts`).

## Decisions
- **ADR-0122**, `docs/adr/0122-fleet-working-now-reads-only-the-cards-at-work.md`. It amends ADR-0098 §2: Working now comes from its own read. The rejection in ADR-0098 is superseded because of the Board read's cost (C-364).
- The conditions live in one shared pure predicate, `isWorkingCard`, in `packages/shared/src/board/`. The API filters in SQL by its parts (`round phase in active`, `fleetSlot not null`, `tracking alive`, `queue place not null`) and then by the predicate. The web keeps `workingNow`'s ordering.
- The page refreshes on the same pushes as before (`board.changed`, `fleet`). It no longer fetches `/board`.

## Acceptance criteria
- [ ] `fleet.e2e.spec.ts`: a project with 40 cards, of which 3 are at work (one of each kind), returns exactly those 3.
- [ ] `fleet.e2e.spec.ts` (authorization): a non-member gets 404. A viewer gets no captured cards.
- [ ] `working-now.test.ts`: rows from the new view equal the rows `workingNow` built from the full Board for the same fixture.
- [ ] The Fleet page makes no `GET /projects/:id/board` call (checked in the demo's network log or a Playwright assertion).
- [ ] ADR-0122 is written and listed in `docs/adr/README.md`, and ADR-0098's index row notes "§2 amended by 0122".
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-fleet-working-now-endpoint.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Fleet with a card at work and shows Working now.

## Risks
- Two definitions of "at work" could drift. The shared predicate and the equality test above guard against it.

## Open questions
- None.
