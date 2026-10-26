# C-427: board_list and board_card say why a card is stuck

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
A session reading the Board sees `needsPerson: true` with no reason, no stacked base, no review stage, no queue place
and no fix counts. The web view has all of it. The session guesses, or asks the person. The list item now carries it.

## Current state
- [Confirmed] `localListCardOf` maps 17 fields, among them `needsPerson` but not `needsPersonReason`
  (`apps/api/src/board/board-session.service.ts:66-87`); the schema is `packages/shared/src/protocol/local.ts:593-619`.
- [Confirmed] The board view has `needsPersonReason`, `stackedOn` (`packages/shared/src/board/contracts.ts:199`),
  `review` (`:256`), `queue` (`:329`) and `ciFixAttempts` (`:243`).

## Decisions
- Add to every list item (the person, 2026-10-26 interview): `needsPersonReason`, `stackedOn {number, merged} | null`,
  `review {state, currentStep, fixRound, fixLimit} | null`, `queue {state, place} | null`, `ciFixAttempts`, and
  `ciFixLimit`.
- All new fields are optional in the schema, so an older runner's MCP server still parses the answer.

## API
- `localBoardListCardSchema` and `localListCardOf`; `board.card` inherits them.
- `apps/runner/src/mcp/tools.ts`: the `board_list` description mentions the reason field (only if C-429 has not
  already changed the same lines; the stage order keeps them apart).

## Acceptance criteria
- [ ] Unit (`board-session.service.spec.ts` or the mapper spec): a `review_failed` card lists its reason and review
      stage; a queued card lists its place; a stacked card lists its base.
- [ ] e2e (`board-session.e2e.spec.ts`): `board.list` returns the reason for a needs-person card.

## Open questions
- None.
