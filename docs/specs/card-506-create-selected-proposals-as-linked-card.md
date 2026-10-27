# C-506: Create selected proposals as linked cards and complete the analysis

## Why
The proposals of an analysis must become real cards in one step, and the analysis card should not linger with no PR to merge.

## What
- `POST board/cards/:number/proposals/create` (operator): the ticked positions become cards in To Do or Inbox, linked back by `originCardId`, with dependencies between selected ones; the rest are dismissed; the analysis card moves to Completed.
- `POST .../proposals/dismiss`: complete without cards.
- Reuses `BoardPlanCards.create` (drafts + links), extended with origin, labels and column.
- Stale round, repeat and wrong card are 409; a `task` proposal without S-24 is 422.

## Done when
- e2e covers create, Inbox, dropped links, idempotency, staleness, dismiss and authorization (viewer 403, other project 404).

Evidence: apps/api/src/board/board-plan-cards.ts:47, apps/api/src/board/board.controller.ts:223

Spec: docs/specs/card-506-create-selected-proposals-api.md
