# ADR-0101: Run at the agent limit queues the card, and the queue starts cards in To Do order

Status: accepted · Date: 2026-10-25 · Amends
[ADR-0067](0067-run-stack-queues-a-stacks-cards-within-the-agent-limit.md) ·
Card: C-398 · Stack: S-15 ·
Spec: [`docs/specs/card-398-run-queue-at-the-worker-limit-a-card-wai.md`](../specs/card-398-run-queue-at-the-worker-limit-a-card-wai.md)

## Context

A card's Run at `BoardSettings.maxRunning` was refused with `409
max_running`, and Auto-run when ready (#443) and a design's Continue stored
that refusal on the card for the person to press Run again later. Only the
cards of a running stack (ADR-0067) waited for a slot. Filling a Board meant
watching it and pressing Run whenever a worker finished.

## Decision

1. **Run on a full Board queues a To Do card.** When `BoardRoundsService.run`
   is refused with `max_running` for a card in To Do, the card goes into the
   run queue and the call answers `200` with the card, whose `queue` says
   `queued` and its place. Every caller of the card Run gets this: the web
   Run, Telegram, a person's session over MCP (`card_run` answers `queued:
   true` and no round), Auto-run when ready and a design's Continue (`run:
   { status: 'queued' }`). Running it again leaves it queued once. A card
   outside To Do (Finished, In progress) is still refused with `max_running`;
   a card with an open dependency is still refused with `dependency_open`
   (ADR-0065). Queueing is audited as `card.run_queued`.
2. **One queue for stack runs and single cards.** The stack run queue of
   ADR-0067 becomes the Board's run queue: `board_stack_run_cards` is renamed
   `board_run_queue` (model `BoardRunQueueCard`, class `BoardRunQueue`), its
   `runId` is null for a card queued on its own, and such an entry keeps who
   queued it and their role, the Run's options (model, profile, effort,
   permission mode) and the card Auto-run started after. The scheduler,
   triggers (every `board.changed`, the runner's `hello`, a 60-second sweep,
   bootstrap) and readiness rules of ADR-0067 are unchanged.
3. **To Do order is the order.** Queued cards start topmost first by their
   To Do position, then number — for stack cards and single cards alike —
   replacing ADR-0067's stack, stage, then number order. Dragging a card in
   To Do reorders the queue. A stage-2 card still waits for its dependency
   wherever it sits.
4. **A dependency gates, it does not refuse.** A queued card whose dependency
   is not ready (one added after it was queued, or a stack stage) is
   `waiting`; it holds no slot and lets the next card start. It starts once
   the dependency is ready and a slot is free.
5. **A single card leaves the queue when it starts or is refused.** Its entry
   is deleted once its round starts. `max_running` and an absent runner keep
   it queued. Any other refusal (budget, profile, design, runner) deletes the
   entry and stores the refusal on the card (`autoRunFailure`), audited as
   `card.auto_run_failed` with `queued: true`, as a refused Auto-run is. A
   card that leaves To Do leaves the queue. A card joining a stack run leaves
   its single entry for the stack's.
6. **Stop takes a queued card out.** `POST board/cards/:number/stop` on a
   card without an active round deletes its queued or waiting entry, sends
   nothing to the runner, and is audited as `card.run_dequeued`. A queued
   card offers Stop, not Run.
7. **Visible where work is watched.** The card face shows "Waiting for a
   slot · #n" (or "Queued · waiting for a dependency"), the Board header
   counts the cards waiting for a slot (`BoardView.queued`), and Fleet's
   Working now lists them under Run queue after the running work.

## Consequences

- A refused Auto-run no longer happens for a full Board; `autoRunFailure`
  with `max_running` is no longer written.
- Stack runs start in the order a person sees in To Do; a person who wants a
  stack first drags its cards up.
- The 409 `max_running` stays for re-running a Finished card and for
  Retry of an In progress card.
