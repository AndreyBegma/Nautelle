# C-424: CI needs-person flags clear themselves, and the merge watch reads In-progress cards

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
Once a card is marked `needsPerson` for CI, the mark stays after its cause is gone: checks that appear late, a red
head someone fixed by hand, a cancelled check re-run green. And an In-progress card that waits on a person is read by
nothing, so a merge on GitHub never completes it and its dependants wait. Both are the merge watch's job.

## Current state
- [Confirmed] Only `branch_diverged` clears itself (`apps/api/src/board/board-work.ts:2085-2090`); otherwise a
  non-fix round clears the flag (`apps/api/src/board/board-rounds.service.ts:1387-1391`).
- [Confirmed] `ci_not_reported`, `ci_still_failing` and `ci_not_green` are set at
  `apps/api/src/board/board-shipping.ts:854`, `:938`, `:1117`.
- [Confirmed] The CI pass skips `needsPerson` cards (`watched`, `board-shipping.ts:186`; `mergeOnly` returns early,
  `:548-561`). The merge watch reads Finished ones but drops their checks (`:232-237`, `:417-450`).
- [Confirmed] The merge watch only reads `column: 'finished'` (`:235`, `:423`). An In-progress card with
  `needsPerson` is in neither set. Dependants count a dependency as satisfied only in Finished or Completed
  (`packages/shared/src/board/dependencies.ts:61-67`).

## Decisions
- A flag clears when the PR's current head shows its cause is gone (the person, 2026-10-26 interview):
  - `ci_not_reported`: the head has any check;
  - `ci_still_failing`: the head is green and not conflicting;
  - `ci_not_green`: `cardCiMergeable(checks)` holds.
  The card then goes back to the CI pass, which may auto-merge it when the project allows it. Recorded as
  **ADR-0116**.
- `review_*`, `round_*`, `forward_*` flags do not clear themselves; C-421 gives a person a retry.
- The merge watch also reads In-progress cards with `needsPerson` and no active round, on the same
  `CARD_FINISHED_PR_POLL_MS` (5 min).

## API
- `mergeWatched` (`board-shipping.ts:232`): `column in ['in_progress','finished']`, and for `in_progress` only
  `needsPerson: true` with no active round.
- `watchMerge`: accept those cards. With the PR open, compute `cardCiStateOf(result.checks)` and clear a clearable
  flag (`needsPerson: false, needsPersonReason: null`), audit `card.needs_person_cleared` `{reason, headSha}`,
  publish. Checks are still not stored by the watch (ADR-0100 §3); the next CI pass reads them.
- A merge seen there goes through `mergedOutside`; `completeMergedCards` completes the card as today.

## Acceptance criteria
- [ ] e2e: a Finished `ci_not_reported` card whose head gets a passing check is cleared within one merge-watch read
      and the next CI pass ships it (auto-merge on).
- [ ] e2e: `ci_still_failing` clears on green; it stays on red and on a conflicting head.
- [ ] e2e: an In-progress `needsPerson` card whose PR merged on GitHub is Completed, and its dependant becomes Ready.
      (Fails today: nothing reads the card.)
- [ ] e2e: a `review_failed` card is never cleared by the watch.
- [ ] ADR-0116 added.

## Risks
- A cleared card may auto-merge a head a person pushed by hand. It passed CI, and `roundUnshippable` still applies.

## Open questions
- Notify when a flag clears? Default: no, the audit entry and the live update only.
