# C-460: Count review sessions toward `maxRunning` and stop them on a hard budget

Stack **S-19 "Review steps and demo videos"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
A review step is a full Claude session on the runner, but the Board neither counts it toward `maxRunning` nor stops
it when a hard budget is reached. So a project at its limit still runs extra sessions, and a reached budget keeps
spending on reviews. This card counts running review sessions as card workers and has a hard-budget pause stop them.

## Scope
**In**: the room check, the Board's running count, review starts, and the hard-budget pause.
**Out**: running steps side by side (C-466); retrying a failed step (C-464).

## Current behaviour
- [Confirmed] `assertRoom` counts only active card rounds (`apps/api/src/board/board-rounds.service.ts:1721-1739`); the Board's `running` count is the same query (`apps/api/src/board/board.service.ts:356-361`).
- [Confirmed] A review step starts without a room check: `startStep` creates the `card_review` run and sends `card.review` (`apps/api/src/board/board-review.ts:438-615`).
- [Confirmed] The hard-budget pause reads only `boardCardRound` rows in active phases (`apps/api/src/board/board-budget-pause.ts:42-52`). A review start is refused by the budget gate (`board-review.ts:644-647`), but a review already running is not stopped.

## Decisions
- ADR-0120 §5 (written by C-459): a running review session counts toward `maxRunning`; a reached hard budget stops it, and it restarts once the budget allows.
- One count for both checks: active rounds plus `board_card_review_runs` in state `running` of the project. It lives in one helper (`apps/api/src/board/board-room.ts`) used by `assertRoom`, `BoardService.running` and the review start.
- A review start with no room returns `wait` (the next poll tries again), never `needs_person`. It takes the same advisory lock as round starts (`lockRoom`, `board-rounds.service.ts:1716-1719`), so a round and a review cannot both take the last slot.
- A review stopped by a budget is not a failure: its `board_card_review_runs` row is deleted (its `card_review` Run is closed as `failed` with outcome `paused: hard budget`, so the cost stays booked), so the gate starts the step again once `launchOf`'s budget check passes. The card is not marked `needsPerson`.
- Scope of a stop: a project budget stops the project's review sessions; a user budget those whose `card_review` Run has that `triggeredById` (as for rounds, spec 28 D3).

## API
No route changes. The `max_running` message counts both: "`N of M card workers are running in this project`".

## Acceptance criteria
- [ ] With `maxRunning` 1 and one review step running, `Run` on another card answers 409 `max_running` (`apps/api/src/board/board-review.e2e.spec.ts`).
- [ ] With `maxRunning` 1 and one round running, the gate does not start a review step and answers `wait`; it starts once the round ends (same spec).
- [ ] The Board view's `running` includes running review sessions (same spec).
- [ ] A reached project hard budget stops a running review session (`card.reviewStop` sent), deletes its review-run row, closes its Run as failed, and leaves `needsPerson` false (`apps/api/src/board/board-budget-pause.e2e.spec.ts`).
- [ ] After the budget allows again, the next poll starts the step again on the same head (same spec).
- [ ] A user budget stops only the review sessions that count toward that user (same spec).

## Risks
- With review on, cards reach Finished later at a full Board, because reviews now wait for room. This is the intent.
- A review fix round and its own card's review never run together, so a card cannot block itself.

## Open questions
- Should review sessions have their own limit apart from `maxRunning`? Default: no, one limit.
