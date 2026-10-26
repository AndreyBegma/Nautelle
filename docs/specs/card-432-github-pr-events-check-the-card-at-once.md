# C-432: GitHub PR and check events check the card at once

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 4. Part of the 2026-10-26 improvement plan.

## Summary
Card shipping polls every 60 s (`CARD_CI_POLL_MS`), and Finished cards that wait on a person only every 5 min. When
the GitHub App is installed, GitHub already tells Nautelle about every PR and check change, and those deliveries only
nudge the runner's collectors. They now run the card's shipping check at once.

## Current state
- [Confirmed] `apps/api/src/github-app/github-routing.ts:173-190`: `pull_request` (opened, synchronize, closed,
  reopened, edited, …), `pull_request_review`, `check_suite`, `check_run` and `status` route to `poll(['prs'])` only.
- [Confirmed] `apps/api/src/github-app/github-app.module.ts:31` imports no board module; nothing in `github-app/`
  calls `BoardShipping`.
- [Confirmed] `BoardShipping.check` is public and runs once per card at a time (`board-shipping.ts:506-517`); the
  merge watch keeps a per-card last-read time (`:257`, `:388-415`).
- [Confirmed] The run queue already re-evaluates on any card change (`apps/api/src/board/board-run-queue.ts:170-173`,
  `work.onChanged`), so a check that stores a result moves the queue. No queue change is needed.

## Decisions
- Events stay hints: the check still reads the PR through the runner (ADR-0001). The poll stays as the fallback (the
  person, 2026-10-26 interview).
- Matching: `pull_request*` by `(project, prNumber)`; `check_suite` / `check_run` by `pull_requests[].number`;
  `status` by `sha` against `ciHeadSha` or the latest round's `headSha`.
- Debounce per card, 5 s. A burst of check events becomes one read.

## API
- `GitHubPayloadFacts` gains `prNumbers: number[]` and `sha: string | null`.
- New `apps/api/src/board/board-pr-events.ts` (`BoardPrEvents`, exported by `board.module.ts`): `onEvent(projectId,
  {prNumbers, sha})` finds the cards, then calls `BoardShipping.onPrEvent(cardId)`.
- `BoardShipping.onPrEvent`: a card in the CI pass gets `check`; a merge-watched card has its last read forgotten and
  is read now (`watchMerge`).
- `github-hook.service.ts` calls it after the response, as it sends the polls. Avoid an import cycle with
  `forwardRef` or an injection token.

## Acceptance criteria
- [ ] e2e (`github-app.e2e.spec.ts`): a signed `check_run completed` delivery for a card's PR leads to one
      `card.checks` read within the debounce, with no poll tick.
- [ ] e2e: `pull_request closed` with `merged: true` for a Finished card that needs a person completes it without
      waiting 5 min.
- [ ] e2e: ten check events in one second lead to one read.
- [ ] An event for an unknown repository or PR reads nothing.

## Risks
- Event storms on a busy repository. Mitigation: debounce, and the `inFlight` guard.

## Open questions
- None.
