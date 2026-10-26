# C-414: Re-run red CI once before a ci_fix round

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
A red check starts a `ci_fix` agent round at once, even when the failure is a flake. On 2026-10-26 a Jest worker
ran out of memory in a suite the card never touched and a pointless fix round started. Spec 359 settled "re-run
once" as Q1 and it was never built. A red head is now re-run once before its first fix round.

## Current state
- [Confirmed] `apps/api/src/board/board-shipping.ts:650-661`: an In-progress card with red CI goes straight to
  `fix()`; `:929-985` starts the round. `:679-682` does the same for a Finished card that went red.
- [Confirmed] `docs/specs/359-card-ships-itself.md:275-277` Q1: "only when the check is a GitHub Actions run
  (`gh run rerun --failed`, once). Other CI goes straight to a fix round."
- [Confirmed] The API does not know the CI provider: no Woodpecker or Actions code in `apps/api/src`. A check only
  has `name`, `bucket` and an https `link` (`apps/runner/src/cards/checks.ts:35,62-69`).
- [Confirmed] `card.ciRetrigger` already resends a PR's event by closing and reopening it
  (`apps/runner/src/cards/ci-retrigger.ts:36-119`, ADR-0043). Nautelle's own CI is Woodpecker.

## Decisions
- Re-run once per head, before the first `ci_fix` round on that head; the re-run is not a fix attempt (the person,
  2026-10-26 interview; spec 359 Q1).
- Provider by the failed checks' links, no setting: a link of the form
  `https://github.com/<owner>/<repo>/actions/runs/<id>[/job/<id>]` is GitHub Actions, re-run with
  `gh run rerun <id> --failed`. Any other CI (Woodpecker included) gets the PR's event again through the existing
  `card.ciRetrigger` close/reopen. This widens spec 359 Q1 to all CI; recorded as **ADR-0114**.
- No Woodpecker API token or call: the control plane and the runner stay provider-free.

## Data / Schema
- `BoardCard.ciRerunSha String?` — the head that was re-run. Migration
  `apps/api/prisma/migrations/20261231000041_card_ci_rerun_sha`. Cleared with the other CI fields when a follow-up
  PR starts (`apps/api/src/board/board-rounds.service.ts:1393-1407`).

## API / Runner
- New typed runner command `card.ciRerun` `{cardId, projectId, root, pr, headSha, runIds: number[]}` (ADR-0010) in
  `packages/shared/src/protocol/commands/cards.ts`, served by `apps/runner/src/cards/ci-rerun.ts`. It checks the PR
  is open at `headSha` (as `ci-retrigger.ts` does) and runs `gh run rerun <id> --failed --repo <github>` per id.
  Result `{rerun: true} | {rerun: false, error: 'head_moved'|'not_open'|'gh_failed', message}`.
- `BoardShipping.fix()`, for `reason: 'red'` only: when `card.ciRerunSha !== headSha`, re-run instead of the round
  (`card.ciRerun` for Actions run ids, else `card.ciRetrigger`), store `ciRerunSha`, audit `card.ci_rerun` with the
  provider and result. A runner that does not advertise the command goes straight to the round. A failed re-run is
  audited and the fix round starts on the next poll.
- A conflict never re-runs.

## Acceptance criteria
- [ ] e2e (`apps/api/src/board/board-shipping.e2e.spec.ts` or a new spec): a red head with an Actions link sends
      `card.ciRerun` once and starts no round; the same head red again starts a `ci_fix` round.
- [ ] Same with a non-Actions link: `card.ciRetrigger` is sent once, then the round.
- [ ] A green re-run ships the card; `ciFixAttempts` stays 0.
- [ ] Runner unit test: `ci-rerun.ts` refuses a moved head and a closed PR, and passes argument arrays only.
- [ ] ADR-0114 is added and linked from ADR-0035.

## Risks
- Close/reopen costs a PR-timeline pair per red head (ADR-0043 accepted the same cost).
- [Unknown] whether Woodpecker builds on `reopened`; ADR-0043 relies on it for lost webhooks. If not, the re-run is a
  no-op and the next poll starts the round after one extra minute.

## Open questions
- Re-run only flaky-looking checks? Default: no, every red head once.
