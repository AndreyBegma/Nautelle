# C-503: Add the analysis card kind and the finish_analysis contract

## Why
Some work is "check something", not "change something", yet every card ends in a pull request. The person wants an analysis card that investigates and proposes new cards instead.

## What
- Kind `analysis` in the schema and shared kinds (the model never picks it; normalizer and capture stay feature|bug).
- Migration `20261231000052_analysis_cards`: the round's report, a `board_card_proposals` table (title, body, kind feature|bug|task, labels, dependsOn, status), `originCardId` on cards, `readOnlyViolation` on runs.
- Local method `card.finishAnalysis` (report + up to 20 proposals): stores them and moves the card to Finished with no collect, review step, demo or issue. `finish_card` on an analysis card is refused `analysis_expected`.
- `readOnly` in `card.run` and the `cardReadOnly` capability (contracts only).
- `analysis` and `origin` in the card detail view.
- ADR-0126.

## Done when
- An e2e finish stores the report and proposals and the card is in Finished with nothing collected.
- Bad dependsOn and too many proposals are refused.
- Only project members read the analysis.

Evidence: apps/api/src/local/local-handlers.ts:179, apps/api/src/board/board-work.ts:417, apps/runner/src/mcp/tools.ts:629

Spec: docs/specs/card-503-analysis-kind-and-finish-analysis-contract.md
