# C-414: Re-run red CI once before starting a ci_fix round

## Why
A red check starts an agent fix round at once, flakes included. On 2026-10-26 a Jest worker OOM in an unrelated suite started a pointless ci_fix round. Spec 359 Q1 settled "re-run once"; it was never built.

## What
- Before the first ci_fix round on a red head, re-run it once: GitHub Actions links via `gh run rerun --failed` (new runner command `card.ciRerun`), any other CI (Woodpecker) via the existing close/reopen `card.ciRetrigger`.
- `BoardCard.ciRerunSha` remembers the head (migration 20261231000041).
- The re-run is no fix attempt. ADR-0114.

## Done when
- A red head is re-run once, then a second red starts the fix round; a green re-run ships with ciFixAttempts 0.
- Older runners go straight to the fix round.

Evidence: apps/api/src/board/board-shipping.ts:650-661,929-985; docs/specs/359-card-ships-itself.md:275-277

Spec: docs/specs/card-414-rerun-red-ci-once-before-a-fix-round.md
