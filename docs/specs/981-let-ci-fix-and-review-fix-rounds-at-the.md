# C-418: Let ci_fix and review_fix rounds at the agent limit go before To Do when a slot frees

Issue: #981

## Why
A fix round refused for max_running retries only on the next 60 s poll, while the run queue gives the freed slot to the next To Do card at once. A card one fix from shipping waits behind new work.

## What
- The rounds service records a fix refused for room (in memory, `BoardFixWaits`).
- While a project has a waiting fix, the run queue starts no To Do card. When there is room it asks BoardShipping.check for the waiting cards, oldest first.
- A wait expires after 15 min or when the card's round starts or it leaves the column.

## Done when
- e2e with maxRunning 1: the ci_fix round takes the freed slot and the queued To Do card waits (fails today).

Evidence: apps/api/src/board/board-shipping.ts:969-985; board-review.ts:282-288; board-run-queue.ts:689-697

Spec: docs/specs/card-418-fix-rounds-wait-their-turn-for-a-slot.md
