# C-398: Run queue: at the worker limit a card waits for a slot and starts in To Do order

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
At `maxRunning` Run is refused and auto-run stores the refusal on the card (`board-auto-run.ts` header: "A refusal is not queued"). Only stacks queue (ADR-0067).

## What
- Run at the limit puts the card in a **Waiting for a slot** state instead of refusing. When a slot frees, the topmost waiting card in To Do order starts. Order is priority; drag to reorder.
- Stack queues and the new queue share one mechanism. Dependencies still gate (a card whose dependency is not ready waits, not refused).
- Visible on the card face, the Board header (waiting count) and Fleet. Remove from queue = Stop.

## Done when
Running 5 cards with 3 slots runs 3 and starts the next two in order as slots free. e2e covers ordering and reorder.

Spec: docs/specs/card-398-run-queue-at-the-worker-limit-a-card-wai.md (PR #937)
