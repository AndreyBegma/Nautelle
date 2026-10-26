# C-489: AI summaries say the pull request's real review state (ADR-0124)

Stack **S-20**, stage 1: after C-471, which also edits `summary-sources.ts`.

## Summary
A card summary always says that an open PR on a Finished card is "waiting for a person to review and accept it", even when GitHub shows it approved or with changes requested. ADR-0066 accepted this as a limit "left for later". The runner already lists open PRs with `gh pr list --json`; asking for `reviewDecision` as well costs nothing. This card carries that value to the card and into the summary, along with Nautelle's own review steps (ADR-0084), which are already stored.

## Scope
**In:**
- the runner's PR collector field list;
- the `pr.opened` / `pr.checks_changed` event schemas;
- one `BoardCard` column;
- the summary source;
- ADR-0124.

**Out:** showing the review state on the card face (a later card may); reading reviews through the GitHub App.

## Current behaviour
- [Confirmed] `apps/api/src/summaries/summary-sources.ts:74-87`: `reviewOf` derives the review only from `prState` and `column`.
- [Confirmed] `apps/runner/src/collectors/prs/prs.ts:21-22`: `LIST_FIELDS = 'number,headRefName,headRefOid,statusCheckRollup,mergeable,title,url'`.
- [Confirmed] `packages/shared/src/protocol/events/fleet.ts:245-264`: `prOpenedDataSchema` and `prChecksChangedDataSchema` carry checks, mergeable and the head SHA.
- [Confirmed] A `pull_request_review` webhook already triggers a `prs` poll (`apps/api/src/github-app/github-routing.ts:177-180`).
- [Confirmed] `BoardCardReviewRun` stores Nautelle's review step results, with `state`, `blockingCount` and `nitCount` (`apps/api/prisma/schema.prisma:4789-4815`).
- [Unknown] which handler writes `BoardCard.ciState` from PR events (`apps/api/src/board/board-work.ts:885` is one write). The card finds it and adds the new field beside it.

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000048_card_pr_review_decision`: `BoardCard.prReviewDecision PrReviewDecision?`, a new enum with the values `approved`, `changes_requested` and `review_required`. Null means unknown, or no review is required.

## Decisions
- **ADR-0124**, `docs/adr/0124-a-cards-review-state-comes-from-githubs-review-decision-read-by-the-runner.md`. The runner reads `reviewDecision` with the PR list it already makes (ADR-0001: the runner touches the forge; the API never does). The API stores the last value per card. This lifts the limit named in ADR-0066 Consequences.
- `reviewDecision` is optional in both schemas. An older runner simply sends none, and the summary falls back to today's text.
- The runner emits `pr.checks_changed` when only the review decision changed, the same as when only the head moved.
- `reviewOf` reads, in order: merged or closed; draft; GitHub's decision ("approved on GitHub", "changes requested on GitHub", "waiting for a reviewer on GitHub"); the latest Nautelle review run's blocking count ("Nautelle review: 2 blocking findings"); then today's fallbacks.

## Acceptance criteria
- [ ] `prs.spec.ts`: a listed PR with `reviewDecision: 'APPROVED'` emits it, and a change of only the decision emits `pr.checks_changed`.
- [ ] Shared protocol spec: an event without `reviewDecision` still parses (older runners).
- [ ] API e2e: a `pr.checks_changed` event with `CHANGES_REQUESTED` sets the card's `prReviewDecision`. A later one without the field leaves it unchanged.
- [ ] `summary-sources.spec.ts`: each branch of `reviewOf` gives its line, including the Nautelle review run.
- [ ] ADR-0124 is listed in `docs/adr/README.md`. No UI, so no demo.

## Risks
- `gh` reports `reviewDecision` as empty for repositories without required reviews. That maps to null, and the summary uses the fallback, which is right.

## Open questions
- Show the decision on the card face? Default: no, keep the face thin (C-392). The summary and the PR link carry it.
