# C-473: Serve Fleet's Working now from a small endpoint and record ADR-0122

## Why
Fleet loads the whole Board read model, on every board.changed and fleet push, only to list who works now. ADR-0098 §2 chose that before the Board read became the heaviest in the app.

## What
- GET /projects/:id/fleet/working returns only cards at work (active round, live slot, live session, run-queue place), mapped like the Board.
- A shared isWorkingCard predicate; Fleet stops fetching /board.
- ADR-0122 amends ADR-0098 §2.

## Done when
- e2e: 40 cards, 3 at work, 3 returned; non-member 404; viewers get no captured cards.
- Rows equal the old full-Board result.
- DemoFlow demo recorded.

Evidence: apps/web/src/app/(app)/projects/[projectId]/fleet/page.tsx:202-210; ADR-0098 §2

Spec: docs/specs/card-473-fleet-working-now-endpoint.md
