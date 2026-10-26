# C-418: ci_fix and review_fix rounds at the agent limit wait their turn

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
A fix round refused for `max_running` is only tried again by the next 60-second poll. Meanwhile the run queue gives the
freed slot to the next To Do card at once, so a card one fix away from shipping waits behind new work. Fix rounds now
hold a place: when a slot frees, a waiting fix goes before To Do.

## Current state
- [Confirmed] `apps/api/src/board/board-shipping.ts:969-985` and `apps/api/src/board/board-review.ts:282-288` catch the
  refusal ("No room, a budget stop, the runner away: the next poll tries again").
- [Confirmed] The run queue starts queued To Do cards whenever `hasRoom` holds (`board-run-queue.ts:689-697`), on any
  card change (`:170-173`) and every `STACK_RUN_SWEEP_MS` (`:34`).
- [Confirmed] The room check for rounds is `assertRoom` (`apps/api/src/board/board-rounds.service.ts:1722`, used at
  `:964` and `:1282`).

## Decisions
- A fix waits in memory, not in the queue table: the poll would retry it after a restart anyway (the person,
  2026-10-26 interview). No schema.
- Fixes before To Do: while a project has a waiting fix, the run queue starts no To Do card. When there is room it
  asks `BoardShipping.check(cardId)` for each waiting fix, oldest first, which starts the round through the usual
  path.
- A wait is dropped when the card's round starts, the card leaves In progress or Finished, or after
  `CARD_FIX_WAIT_MAX_MS` (15 min), after which the poll behaves as today.

## API
- New `apps/api/src/board/board-fix-waits.ts` (`BoardFixWaits`: `add(projectId, cardId)`, `take(projectId)`,
  `has(projectId)`), provided in `board.module.ts`.
- `BoardRoundsService`: when `assertRoom` refuses a `ci_fix` or `review_fix` start, record the wait before throwing.
  No change to shipping or review: their catch stays.
- `BoardRunQueue.tick`: serve fix waits first, then queued cards only if room is left.

## Acceptance criteria
- [ ] e2e (`apps/api/src/board/board-run-queue.e2e.spec.ts`): with `maxRunning` 1, a running card, a red card waiting
      for a fix and a queued To Do card: when the running round ends, the `ci_fix` round starts and the To Do card
      stays queued. Fails today: the To Do card starts.
- [ ] e2e: a wait older than 15 min no longer holds To Do.
- [ ] e2e: a review fix waits the same way.

## Risks
- A fix that keeps failing for another reason (budget stop) holds To Do for at most 15 minutes.

## Open questions
- Show "waiting for a slot" on the fixing card's face? Default: no, the log and `board_card` (C-427) only.
