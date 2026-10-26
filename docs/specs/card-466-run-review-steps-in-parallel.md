# C-466: Start a head's review steps together instead of one after another

Stack **S-19 "Review steps and demo videos"**, stage 4. Part of the 2026-10-26 improvement plan.

## Summary
The review gate starts one step, waits for its report, then starts the next. A project with three steps waits three
sessions end to end before a card reaches Finished — ADR-0084 accepted this ("A card takes longer to reach
Finished"). With the runner holding one session per step (C-459), retries (C-464) and review sessions counted as
workers (C-460), the gate can start every step at once.

## Current behaviour
- [Confirmed] The gate walks the steps in `position` order and returns after starting the first one without a run, so the next starts only after it reported (`apps/api/src/board/board-review.ts:218-245`).
- [Confirmed] The gate stops "the" review session of the card, by short id (`board-review.ts:713-738`).
- [Confirmed] The strip already shows each step's own state (`apps/api/src/board/board-mapper.ts:539-548`); `currentStep` is the first running one (`board-mapper.ts:549-571`).

## Decisions
- ADR-0120 §3 (written by C-459); amends ADR-0084 §3 "in order". Source: the 2026-10-26 improvement plan (candidate 1).
- On a runner that advertises `card.reviewStatus`, one gate call starts every enabled step that has no run (and the next attempt of a failed one), in `position` order, while there is room under `maxRunning` (C-460). Steps it could not start for room start on later calls.
- The gate decides only once every step has a final state: any failed after its retries → `needs_person`; any blocked → one `review_fix` round with all blocking findings, as today; all passed → `pass`.
- Sessions are stopped one by one, with `card.reviewStop` `session` (C-459): a reported or failed step's session is stopped when it settles; superseded runs are stopped by their session.
- A runner without `card.reviewStatus` keeps today's one-at-a-time order and per-card stop.
- Findings published to GitHub (`publishReviewComments`) stay one PR review per step, in the order they report.
- `currentStep` lists the first running step; the strip needs no other change.

## Acceptance criteria
- [ ] With three enabled steps and room, one gate call sends three `card.review` with three sessions (`apps/api/src/board/board-review.e2e.spec.ts`).
- [ ] With room for one, steps start one per freed slot (same spec).
- [ ] Two steps pass and one is blocked: one `review_fix` round with only the blocking findings, after the last report (same spec).
- [ ] A step that reports is stopped with its own `session`; the other steps keep running (same spec).
- [ ] On a runner without `card.reviewStatus`, the order is the old one (same spec).

## Risks
- Several review sessions of one card run tests at once on the runner machine; each has its own test database and port (C-459). The machine load is bounded by `maxRunning`.

## Open questions
- Should a project be able to keep its steps in order (a step that needs another's result)? Default: no — steps report independently today.
