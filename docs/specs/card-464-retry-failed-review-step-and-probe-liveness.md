# C-464: Notice a dead review step within minutes and retry a failed step once

Stack **S-19 "Review steps and demo videos"**, stage 3. Part of the 2026-10-26 improvement plan.

## Summary
A review step that fails, or whose session dies without calling `report_review`, hands the card to a person — and a
dead session is only noticed after the full 60-minute step timeout. A `card.review` the runner never answered waits
the same hour. This card asks the runner (`card.reviewStatus`, C-459) whether a quiet step is alive, and retries a
failed step once before the card needs a person.

## Current behaviour
- [Confirmed] A running step is failed only after `REVIEW_STEP_TIMEOUT_MS` = 60 min (`packages/shared/src/review/contracts.ts:185-189`, `apps/api/src/board/board-review.ts:222-234`).
- [Confirmed] A start with no answer (504) returns `wait` and leaves the run `running` until that timeout (`board-review.ts:591-595`).
- [Confirmed] A `failed` run, a timeout, or a start the runner refused marks the card `needsPerson` with `review_failed` at once (`board-review.ts:226-243`, `602-611`).
- [Confirmed] One run per `(cardId, headSha, pass, stepId)` (`apps/api/prisma/schema.prisma:4826-4827`), so a step cannot run twice on a head and pass.

## Decisions
- ADR-0120 §2 and §4 (written by C-459). Source: the 2026-10-26 improvement plan (candidates 2, 3).
- **Attempts.** `board_card_review_runs.attempt` (from 1); the unique key gains it. A step's state on a head and pass is its highest attempt. A failed attempt below `REVIEW_STEP_ATTEMPTS_MAX = 2` (shared) starts the next attempt on the next gate call; the second failure marks `needsPerson` `review_failed` as today. A runner answering `unsupported` (`board-review.ts:450-456`) and a superseded run are never retried.
- **Liveness.** For a `running` attempt older than `REVIEW_PROBE_AFTER_MS = 3 min`, the gate asks `card.reviewStatus` at most once per `REVIEW_PROBE_INTERVAL_MS = 2 min` per run (in memory):
  - `running` → wait, up to `REVIEW_STEP_TIMEOUT_MS`, which stays the cap;
  - `exited` with `reported: false` → failed, "the session ended without a report";
  - `exited` with `reported: true` → wait one more probe for the report to land, then failed;
  - `unknown` → failed, "the runner never started the step" (this is the unanswered 504 case).
  A runner without `card.reviewStatus` keeps today's timeout only.
- The strip and the findings read the highest attempt of each step (`apps/api/src/board/board-review-facts.ts`).

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000047_review_run_attempts`: `attempt Int @default(1)` on `BoardCardReviewRun`; `@@unique([cardId, headSha, pass, stepId, attempt])` replaces the old unique.

## Acceptance criteria
- [ ] A step whose first attempt fails starts a second attempt on the same head and pass; the card is not `needsPerson` (`apps/api/src/board/board-review.e2e.spec.ts`).
- [ ] A step whose second attempt fails marks `needsPerson` `review_failed` (same spec).
- [ ] A `card.review` with no answer, then `card.reviewStatus` `unknown` after 3 minutes (fake clock), fails attempt 1 and starts attempt 2 — not after 60 minutes (same spec) — the test that would have caught the hour-long wait.
- [ ] `exited` without report fails the attempt at the first probe (same spec).
- [ ] `running` keeps waiting and the 60-minute cap still fails it (same spec).
- [ ] The card face shows the second attempt's state for the step (same spec or `board-mapper` spec).
- [ ] The migration applies on develop's database.

## Risks
- A retry doubles the cost of a step that keeps failing. Bounded at two attempts.

## Open questions
- Should a step blocked by findings ever be retried? Default: no — blocked is an answer, not a failure.
