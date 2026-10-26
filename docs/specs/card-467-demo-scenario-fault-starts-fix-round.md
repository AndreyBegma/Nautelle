# C-467: Send a demo that fails on a broken locator back to the card's worker

Stack **S-19 "Review steps and demo videos"**, stage 4. Part of the 2026-10-26 improvement plan.

## Summary
Most first recordings that fail, fail on the scenario, not the feature: on 2026-10-25, 7 of 12 demos failed first
time, mostly on Playwright strict-mode locators. Today such a demo waits for a person's "Record again", after
someone fixed the scenario by hand. This card recognises a scenario fault in the failure reason and starts a fix
round for the card's worker with the failing step and locator; the new head is recorded again.

## Current behaviour
- [Confirmed] The runner reports a failure as "DemoFlow `<stage>` failed at step `<n>`: `<message>`" (`apps/runner/src/demos/report.ts:83-98`), sent in `demo.status` and stored as `card_demos.reason` (`apps/api/src/demos/card-demos.service.ts:616-653`).
- [Confirmed] "A failed demo is a warning, never a gate" (`card-demos.service.ts:156-169`); nothing starts a round for it.
- [Confirmed] `BoardRoundsService.reviewFix` resumes the card's session with a list of findings, counts one of the PR's `REVIEW_FIX_ROUNDS_MAX = 3` review fix rounds, and needs no review step (`apps/api/src/board/board-rounds.service.ts:555-585`, `packages/shared/src/review/contracts.ts:25`).
- [Unknown] The exact DemoFlow 0.7.0 messages for a strict-mode violation and a locator that matches nothing; the stored `card_demos.reason` rows of the 2026-10-25 demos have them.

## Decisions
- ADR-0121 §4 (written by C-458); amends ADR-0090 "a failed demo is a warning" for this one case. Source: the 2026-10-26 improvement plan (candidate 11).
- **Recognition is in the API, from the stored reason**, by a pure helper `demoScenarioFault(reason)` in `packages/shared/src/demos/scenario-fault.ts`: `{ kind: 'strict_mode' | 'locator_missing', step: number, detail: string } | null`, only for the `execution` stage. No runner change. Its test uses the real reasons from 2026-10-25.
- **Only an `auto` demo of the PR's current head** starts a fix; a person's "Record again" does not.
- **The fix round is a `review_fix` round** with one finding: step name `Demo`, file the scenario path, title "The demo scenario fails at step N: strict mode violation" (or "no element matches"), body the reason. It shares the review fix budget; with the budget spent, the demo stays a failed warning as today. No new round trigger, no migration.
- **Order.** `CardDemosService` tells a registered listener of the fault before it calls `settled`; `BoardShipping` registers it and starts the round. So the auto-merge that `settled` triggers finds the card In progress and does not merge it.
- The round's new head goes through CI, review and its own demo as any head does.

## Acceptance criteria
- [ ] `demoScenarioFault` recognises the 2026-10-25 strict-mode and missing-locator reasons, and returns `null` for a readiness failure, a rendering failure and an upload error (`packages/shared/src/demos/scenario-fault.spec.ts`).
- [ ] An `auto` demo of the current head failing with a strict-mode reason starts one `review_fix` round whose prompt names the step and locator, and the card is not merged (`apps/api/src/board/board-demos.e2e.spec.ts`).
- [ ] A manual demo with the same failure starts nothing (same spec).
- [ ] With `reviewFixAttempts` at `REVIEW_FIX_ROUNDS_MAX`, nothing starts and the card merges as today (same spec).
- [ ] A failure for a head the PR has moved past starts nothing (same spec).

## Risks
- A scenario fault caused by the feature (the button really is missing) also goes to the worker. That is the right place for it.
- The shared budget means a card with demo fixes has fewer review fixes left. Bounded and visible in the strip's fix count.

## Open questions
- Should demo fix rounds have their own budget? Default: no, they share the review fix budget.
