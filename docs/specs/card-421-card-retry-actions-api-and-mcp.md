# C-421: Card retry actions without an agent round: API and MCP

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
When a card stops on a transient problem (a review step timed out, CI never reported, a stale flag), the only way on
is a full agent round (Run or feedback), which costs a round and resets context. The person gets three cheap actions:
re-check CI, retry the failed review step, and clear the flag. The web buttons follow in C-425.

## Current state
- [Confirmed] `apps/api/src/board/board.controller.ts:107-542` has no retry or re-check route; `collect`
  (`:442`) is the only non-round repair.
- [Confirmed] Session board methods are `board.list/card/wait`, `card.create/run/move/feedback/message/stop/take/
  release` (`apps/api/src/local/local-board-handlers.ts:23-36`).
- [Confirmed] A failed or timed-out review step marks `review_failed` and is never started again on that
  `(headSha, pass)`: the gate finds its row (`apps/api/src/board/board-review.ts:213-243`); the row is unique on
  `(cardId, headSha, pass, stepId)` (`apps/api/prisma/schema.prisma:4826`).

## Decisions
- `POST /board/cards/:number/retry` with `{action: 'ci' | 'review' | 'clear'}`, operator role, audited
  `card.retried` `{action, reason}` (the person, 2026-10-26 interview).
  - `ci`: for a card with an open PR, clear a `ci_*` flag, reset `ciNoneSince` and `ciRetriggeredSha`, and run
    `BoardShipping.check` now. CI decides again; the fix budget is not reset.
  - `review`: for `review_failed`, detach the failed or timed-out run (`stepId: null`, its history kept), clear the
    flag, and check now, so the gate starts that step again.
  - `clear`: clear `needsPerson` of any reason with no other change; automation resumes.
- Refusals: 409 `nothing_to_retry` when the card's state does not fit the action; `wrong_column` outside In progress
  and Finished.
- No ADR; this is a person's action on existing rules.

## API
- `RetryBoardCardDto` in `apps/api/src/board/dto.ts`; `RetryBoardCardRequest` in
  `packages/shared/src/board/contracts.ts`; logic in a new `apps/api/src/board/board-retry.ts`, registered in
  `board.module.ts`; `BoardReview.detachFailed(cardId, headSha, pass)` in `board-review.ts`.
- Local method `card.retry` `{card, action}` in `packages/shared/src/protocol/local.ts`, handled in
  `local-board-handlers.ts` (manual sessions, as `card.run`); MCP tool `card_retry` in `apps/runner/src/mcp/tools.ts`.

## Acceptance criteria
- [ ] e2e (`apps/api/src/board/board-retry.e2e.spec.ts`): `review` on a timed-out step starts that step again on the
      same head, and the old run stays in the history.
- [ ] e2e: `ci` on `ci_not_reported` clears the flag and sends one more `card.ciRetrigger` after the wait.
- [ ] e2e: `clear` on `round_pushed_nothing` clears the flag; the audit names the reason.
- [ ] e2e: a viewer gets 403; another project's card gets 404 (authorization test).
- [ ] Local e2e: `card.retry` from a manual session works; from a card worker it is refused as `card.run` is.

## Risks
- A detached review run shows under its `stepName` without a live step; the review strip must not count it.

## Open questions
- Reset the fix budget on `ci`? Default: no; C-420 resets it on a person's round.
