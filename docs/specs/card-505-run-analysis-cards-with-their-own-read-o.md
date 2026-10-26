# C-505: Run analysis cards with their own read-only prompt

## Why
The worker prompt tells every card to commit, write a PR description and call finish_card; an analysis card needs the opposite.

## What
- `cardAnalysisPrompt` (prompt version 26): the question, the read-only rules, a report with What I looked at / Findings / Recommendation, proposals as S–M cards (Why / What / Done when, kind, labels, dependencies), then `finish_analysis`.
- Running an analysis card: `readOnly: true`; no issue, spec, draft PR, demo or escalation; branch stays null.
- A runner without `cardReadOnly` refuses the Run with the runner error.
- Feedback rounds stay read-only and replace the pending proposals.

## Done when
- Prompt snapshot and rounds e2e (fake runner) pass; feature and bug rounds are unchanged.

Evidence: packages/shared/src/board/worker-prompt.ts:45,592; apps/api/src/board/board-rounds.service.ts:1026

Spec: docs/specs/card-505-launch-analysis-rounds-with-their-prompt.md
