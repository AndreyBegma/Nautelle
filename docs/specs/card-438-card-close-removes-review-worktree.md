# C-438: `card.close` also stops the card's review session and removes its review worktree

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
A card's review step runs in its own session and worktree (`.wt-<repo>-review-<shortId>`). The API stops it only
from inside the review loop. When a card merges, is closed or moved away while a review runs — or the stop was
skipped because the runner was offline — the review worktree stays. On the person's machine 16 review worktrees
were left on 2026-10-26.

## Scope
**In:** `CardExecutor.close` in `apps/runner/src/cards/executor.ts`, its tests.
**Out:** `apps/api/src/board/board-review.ts` (not edited — stack S-19 also changes it); the orphan sweep for a
card the runner no longer has a record of (C-439).

## Current behaviour
- [Confirmed] `apps/runner/src/cards/executor.ts:613-631`: `close` kills the round's session and, with
  `removeWorktree`, removes the card worktree and the record. The review session and worktree are not touched.
- [Confirmed] `apps/runner/src/cards/executor.ts:735-758`: `stopReview` kills `nautelle-review-<shortId>`, drops the
  review record and calls `removeReviewWorktree`; it is idempotent.
- [Confirmed] `apps/api/src/board/board-review.ts:713-740`: the API's `stopSession` returns at once unless the
  runner is connected, and is called only from the review loop (`:227,236,246,678`).
- [Confirmed] `apps/api/src/board/board-work.ts:1864-1886`: closing a card sends `card.close` with
  `removeWorktree: true`.

## Decisions
- D1. `card.close` with `removeWorktree: true` also does what `stopReview` does, for the record's `shortId`, inside
  the same `serial` chain order (the review key first, then the card). *Source: the 2026-10-26 improvement plan;
  keeping the fix runner-side avoids editing `board-review.ts` (S-19).*
- D2. With `removeWorktree: false` the review is left alone (a paused card may still be reviewed).
- D3. `CardCloseResult` is unchanged; the removal is logged.

## Acceptance criteria
- [ ] `executor.spec.ts`: a card with a live review session and review worktree, closed with
      `removeWorktree: true`, ends with neither, and the review record is gone.
- [ ] `executor.spec.ts`: closed with `removeWorktree: false`, the review session and worktree stay.
- [ ] Closing a card with no review touches nothing review-related and still succeeds.
- [ ] `bun run check` and the runner tests pass.

## Risks
- Coordination with S-19: this card deliberately does not touch `board-review.ts`. The API's review state for a
  closed card may still say `running` until S-19 or the review timeout settles it; the runner side is clean either
  way.

## Open questions
- Does every merge path send `card.close`? [Unknown] for the auto-merge path; if not, C-439's sweep catches the
  leftover at the next start. Default: no API change in this card.
