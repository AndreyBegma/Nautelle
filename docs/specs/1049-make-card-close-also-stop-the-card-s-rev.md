# C-438: Make card.close also stop the card's review session and remove its review worktree

Issue: #1049

## Why
The review worktree is removed only from inside the API's review loop, and only while the runner is connected. A card that merges, closes or moves mid-review leaves `.wt-<repo>-review-*` behind; 16 were left on the person's machine.

## What
- `card.close` with `removeWorktree: true` also does `stopReview`'s work for the card's short id. Runner-side only, so `board-review.ts` (stack S-19) is not touched.

## Done when
- Executor tests: close with a live review removes session, worktree and review record; `removeWorktree: false` leaves them.

Evidence: apps/runner/src/cards/executor.ts:613-631,735-758; apps/api/src/board/board-review.ts:713-740.

Spec: docs/specs/card-438-card-close-removes-review-worktree.md
