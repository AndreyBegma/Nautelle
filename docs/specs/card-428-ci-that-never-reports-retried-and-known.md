# C-428: CI that never reports: retrigger with backoff, and no unchecked first PR

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 3. Part of the 2026-10-26 improvement plan.

## Summary
A head without checks gets one retrigger, then `ci_not_reported`. A Woodpecker that misses two events in a row (a
tunnel blip) needs a person. And in a project whose CI has never reported, the first card PR ships with no checks at
all (ADR-0043 Consequences). Both live in `shipsWithoutChecks`.

## Current state
- [Confirmed] `apps/api/src/board/board-shipping.ts:760-777`: wait `CARD_CI_MISSING_MS` (5 min,
  `packages/shared/src/board/types.ts:206`), retrigger once per head (`ciRetriggeredSha`), then `ciNotReported`.
- [Confirmed] `hasCi` (`:780-786`) is "some card of the project had checks"; without that the head ships unchecked
  (`:766`). ADR-0043 Consequences: "The first card PR of a project whose CI is down ships unchecked".
- [Confirmed] The runner's `card.checks` reports checks only (`apps/runner/src/cards/checks.ts`).

## Decisions
- Up to `CARD_CI_RETRIGGER_MAX = 3` retriggers per head, waiting `CARD_CI_MISSING_MS × 2^n` (5, 10, 20 min) before
  each; `ci_not_reported` after the last wait (the person, 2026-10-26 interview).
- "Has CI" also holds when the PR head contains a CI config. The runner reads it (ADR-0001):
  `git ls-tree --name-only <headSha> -- .github/workflows .woodpecker .woodpecker.yml .woodpecker.yaml .gitlab-ci.yml`
  in the project root. A missing object gives "unknown", which keeps today's rule.
- Amends ADR-0043; noted in ADR-0043 Consequences with a link to this spec. No new ADR.

## Data / Schema
- `BoardCard.ciRetriggerCount Int @default(0)`, reset with `ciRetriggeredSha` when the head changes or a new PR
  starts. Migration `apps/api/prisma/migrations/20261231000043_card_ci_retrigger_count`.

## API / Runner
- `CardChecksResult` gains optional `ciConfigured: boolean` (`packages/shared/src/protocol/commands/cards.ts`),
  filled by `apps/runner/src/cards/checks.ts`.
- `shipsWithoutChecks`: `hasCi || result.ciConfigured === true`; retrigger while `ciRetriggerCount < MAX` and the
  backoff has passed since `ciNoneSince`; audit each with `attempt`.

## Acceptance criteria
- [ ] e2e: a head with no checks is retriggered at 5, 10 and 20 min and marked `ci_not_reported` only after the third
      wait (fails today after one).
- [ ] e2e: a new head resets the count.
- [ ] e2e: a project with no CI history whose head has `.woodpecker.yml` does not reach Finished unchecked; it is
      retriggered and marked. Without a config it ships as today.
- [ ] Runner unit: `ciConfigured` true / false / absent on a missing object.

## Risks
- Three close/reopen pairs in a PR timeline in the worst case.

## Open questions
- Make the cap a Board setting? Default: no, a constant.
