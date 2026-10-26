# C-461: Retry a failed PR file listing instead of skipping the head's demo forever

Stack **S-19 "Review steps and demo videos"**, stage 1. Part of the 2026-10-26 improvement plan. Kind: bug.

## Summary
To decide whether a green head gets a demo, the Board asks the runner for the PR's changed files (`pr.inspect`).
When that read fails once — the runner busy, `gh` rate-limited, a timeout — the head gets a `skipped` demo row, and
because a head is recorded once whatever came of it, it never gets a demo. This card retries the read a few times
before giving up.

## Current behaviour
- [Confirmed] A head with any `card_demos` row is left alone: `recorded > 0` returns (`apps/api/src/demos/card-demos.service.ts:346-349`).
- [Confirmed] On an `inspect()` error the row is still created and then settled `skipped` with "The PR's changed files were not read: …" (`card-demos.service.ts:361-396`), so the next poll returns at line 349.
- [Confirmed] `prFiles` turns a runner refusal, no answer, or a `BoardFailure` into `{ error }` (`apps/api/src/board/board-shipping.ts:720-748`).

## Decisions
- On an `inspect()` error, `autoRecord` creates no row and logs once (the `skip` log, `card-demos.service.ts:412-421`); the next poll reads the files again. Source: ADR-0121 §5 (written by C-458), which amends ADR-0095 §2 ("When the file list cannot be read, the demo row is created `skipped`"); the 2026-10-26 improvement plan (candidate 7). ADR-0095 §3 (one demo per head) is kept.
- The retry is bounded: an in-memory count per `card:head`, at most `DEMO_PR_FILES_ATTEMPTS = 3` reads (shared constant in `packages/shared/src/demos/contracts.ts`). The third error records the `skipped` row as today, so a head is never read without end. The poll interval spaces the reads.
- This is not the "Retrying a skipped demo" ADR-0095 rejects: that is a runner that cannot record; this is a failed read before anything is queued.

## Acceptance criteria
- [ ] `pr.inspect` failing once and then answering with a UI file queues one `auto` demo of the head (`apps/api/src/demos/demo-pr-files.e2e.spec.ts`, new) — the test that would have caught this.
- [ ] `pr.inspect` failing three times records one `skipped` row with the read error as its reason, and a fourth poll does not call `pr.inspect` (same spec).
- [ ] No `card_demos` row exists for the head after the first failure (same spec).

## Risks
- After an API restart the in-memory count starts again, so a head can be read three more times. Harmless.

## Open questions
- None.
