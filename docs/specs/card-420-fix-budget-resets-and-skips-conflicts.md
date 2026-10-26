# C-420: The fix budget resets on a person's round and conflicts do not spend it

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
`ciFixAttempts` counts every `ci_fix` round of a PR, conflicts included, and only a new PR resets it. After a person
steps in, the next red check marks the card again with no fix round. The budget now resets on a person's round,
conflict rounds have their own cap, and a fix round that pushed nothing ends the budget.

## Current state
- [Confirmed] `apps/api/src/board/board-rounds.service.ts:1385-1391`: a `ci_fix` round increments `ciFixAttempts`, a
  `review_fix` round `reviewFixAttempts`; any other round only clears `needsPerson`. The counters reset only for a
  follow-up PR (`:1393-1407`) or a forward PR (`apps/api/src/board/board-work.ts:1444-1458`).
- [Confirmed] `apps/api/src/board/board-shipping.ts:935`: `ciFixAttempts >= CARD_CI_FIX_ATTEMPTS_MAX` (3,
  `packages/shared/src/board/types.ts:188`) marks `ci_still_failing` whether the head is red or conflicting
  (`:959-968`).

## Decisions
- A `run`, `feedback` or `escalation` round sets `ciFixAttempts` and `reviewFixAttempts` to 0 (the person,
  2026-10-26 interview: the person acting restarts automation).
- A conflict round counts on `conflictFixAttempts`, capped by the same `CARD_CI_FIX_ATTEMPTS_MAX`; a red round never
  spends it and a conflict round never spends `ciFixAttempts`.
- A `ci_fix` round for a red head that pushed no commit spends the rest of the budget: the next red marks
  `ci_still_failing` (needed by C-423's "change nothing" instruction).
- Recorded as **ADR-0115**, amending ADR-0035 D6.

## Data / Schema
- `BoardCard.conflictFixAttempts Int @default(0)`; migration
  `apps/api/prisma/migrations/20261231000042_card_conflict_fix_attempts`. Reset wherever `ciFixAttempts` is reset.

## API
- `board-rounds.service.ts:1385-1391`: increment by the fix input's `reason`; reset both budgets in the else branch.
- `board-shipping.ts fix()`: check the counter of the reason; a conflict that hits its cap marks `ci_still_failing`
  with `conflict: true` as today. For a red head, when the latest round was `ci_fix` and
  `roundUnshippable(...) === 'round_pushed_nothing'`, mark at once.
- `CARD_CI_FIX_ATTEMPTS_MAX` doc in `types.ts` says both budgets.

## Acceptance criteria
- [ ] e2e: three red fix rounds, then a person's feedback round, then red again → a fourth `ci_fix` round starts
      (fails today: `ci_still_failing`).
- [ ] e2e: three conflict rounds leave `ciFixAttempts` at 0; a red head after them starts a fix round.
- [ ] e2e: a red fix round that pushes nothing → next red marks `ci_still_failing` with no further round.
- [ ] ADR-0115 added.

## Risks
- Resetting on a person's round lets a person spend another three rounds per nudge; that is their decision.

## Open questions
- Show `conflictFixAttempts` on the card? Default: no, only in the audit entry.
