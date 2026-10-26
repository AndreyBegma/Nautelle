# C-503: Card kind `analysis` and the `finish_analysis` contract

Stack **S-23 "Analysis cards"**, stage 0 (lead). Part of the 2026-10-26 improvement plan.

## Summary
A new card kind, `analysis`: the card investigates (reads code, docs, logs, runs read-only commands) and ends
with a **report** and a list of **proposed cards** instead of a pull request. This card lays the schema, the
shared contracts and the API side of the finish; the runner, the prompt, the "Create selected" action and the
UI follow in later stages of the stack. It also writes ADR-0126.

## Scope
**In**
- `analysis` in `BoardCardKind`, the proposals table, the report on the round, the link back (`originCardId`).
- Shared contracts: the `card.finishAnalysis` local method, the proposal view, the create request/response
  types (used by C-506), the `readOnly` field of `card.run` and the `cardReadOnly` runner capability (used by
  C-504 and C-505).
- The API handler of `card.finishAnalysis`: stores the report and the proposals and moves the card to Finished
  with no collect, review step, demo or issue.
- `analysis` in the card detail view, read by C-507.
- ADR-0126.

**Out**
- The runner's read-only launch (C-504), the prompt and the gating of the Run (C-505), Create selected
  (C-506), every UI (C-507, C-508).
- The `task` card kind itself (stack S-24) and card labels (stack S-22).

## Decisions
- D1. An analysis card never commits, pushes or opens a pull request; it ends with a report and proposals —
  *the person, 2026-10-26 interview (Q15)*.
- D2. A proposal is `{title, body, kind, labels, dependsOn}`; `kind` is `feature | bug | task` (`task` is
  S-24's person-task kind, allowed in the contract now) — *the person, 2026-10-26 interview*.
- D3. The finish is its own MCP tool, `finish_analysis` (`card.finishAnalysis`), offered only in an analysis
  session — the pattern of `report_review` (ADR-0084 §4, [Confirmed] `apps/runner/src/mcp/tools.ts:629-650`).
  An analysis card's `finish_card` is refused with the new local error `analysis_expected`, so the worker
  retries with the right tool. `finish_card` stays as it is for every other card
  ([Confirmed] `apps/api/src/local/local-handlers.ts:179-209`).
- D4. The proposal kind is its own enum (`CardProposalKind`), not `BoardCardKind`, so storing a `task`
  proposal does not depend on S-24 having merged.
- D5. The model never picks `analysis`: the normalizer and the capture contract keep `feature | bug`
  ([Confirmed] `packages/shared/src/text/normalize-contract.ts:55`, `packages/shared/src/board/capture-contract.ts:71`
  both use `BOARD_CARD_KINDS`). Add `WORK_CARD_KINDS = ['feature', 'bug']` for them; `BOARD_CARD_KINDS` and
  `LOCAL_CARD_KINDS` ([Confirmed] `packages/shared/src/protocol/local.ts:411`) gain `analysis`. An analysis card
  is always `kindSource: person`.

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000052_analysis_cards`:
- `BoardCardKind` gains `analysis` ([Confirmed] enum at `apps/api/prisma/schema.prisma:3291`).
- `BoardCardRound.report String?` — the report, markdown, at most 20 000 characters (`ANALYSIS_REPORT_MAX`).
  The round's `summary` (at most 4 000, [Confirmed] `schema.prisma:3925`) holds its first paragraph.
- `Run.readOnlyViolation Boolean @default(false)` — beside `artifactIncomplete`.
- `BoardCard.originCardId String?` → `BoardCard` (`onDelete: SetNull`), indexed: the analysis card a card was
  created from.
- New `board_card_proposals` (`BoardCardProposal`): `id`, `cardId` (the analysis card, cascade), `roundId`
  (cascade), `position Int` (0-based), `title` (≤ 200), `body` (markdown, ≤ 8 000), `kind CardProposalKind`
  (`feature | bug | task`), `labels String[]` (≤ 5, each ≤ 40), `dependsOn Int[]` (positions of earlier
  proposals of the same round), `status CardProposalStatus` (`pending | created | dismissed`, default
  `pending`), `createdCardId String? @unique` (SetNull), `decidedById String?` (SetNull), `decidedAt`,
  `createdAt`. `@@unique([roundId, position])`, `@@index([cardId, status])`.

## API
- Local method `card.finishAnalysis` (`minRole: operator`, `needsProject: true`, beside `card.finish` at
  [Confirmed] `packages/shared/src/protocol/local.ts:1140`). Args (strict):
  `report` (1–20 000), `proposals` (0–20 items: `title`, `body`, `kind`, `labels?`, `dependsOn?`).
  `dependsOn` names only earlier positions (so the graph is acyclic by construction); a later or out-of-range
  index is `invalid_args`. Result `{number, finished: true, proposals: n}`. Also
  `readOnlyViolation?: boolean`, set only by the runner daemon's guard (C-504) and dropped from any other
  caller, as `artifactIncomplete` is ([Confirmed] `local.ts:314-320`); stored on the round's run. New local
  error codes `analysis_expected` and `read_only_violation`.
- The card is resolved from `session.id` as `finishByWorker` does ([Confirmed]
  `apps/api/src/board/board.service.ts:1459-1490`); a session of a non-analysis card gets `not_a_card_session`.
- The handler, in one transaction: writes `report`/`summary` on the active round, replaces the card's
  `pending` proposals with the new ones (created and dismissed ones are kept), ends the round as `finished`
  by the worker, and moves the card to Finished with `collect: false`. It must not take the
  `finishInPlace` path ([Confirmed] `apps/api/src/board/board-work.ts:417-425`) — an analysis card does not
  ship — and the Finished move must not start a review step (ADR-0084) or a demo. Audit `card.finished` with
  `proposals: n`.
- `BoardCardDetail.analysis: { report: string | null; proposals: CardProposalView[] } | null` — `null` for any
  other kind. `CardProposalView` carries `position, title, body, kind, labels, dependsOn, status,
  createdCard: {number, title} | null`. `BoardCardDetail.origin: {number, title} | null` from `originCardId`.
- Shared `cardRunArgsSchema` ([Confirmed] `packages/shared/src/protocol/commands/cards.ts:225`) gains
  `readOnly: z.literal(true).optional()`, refined to exclude `pullRequest`, `newBranch`, `startBranch` and
  `demo`; `capabilities.cardReadOnly?: boolean` with `cardReadOnlyAvailable()` beside `cardDemoAvailable`
  ([Confirmed] `packages/shared/src/protocol/capabilities.ts:303,374`).

## ADR-0126 outline
`docs/adr/0126-an-analysis-card-investigates-read-only-and-ends-with-proposed-cards.md`:
1. Context: work that is "check something", not "change something"; today every card ends in a PR.
2. Decision: kind `analysis`; read-only round (runner-enforced, C-504); `finish_analysis` with report +
   proposals; no collect, review, demo, issue; Create selected makes cards linked by `originCardId`; the
   analysis card then completes itself.
3. Enforcement layers: deny rules at launch, detached worktree, no push/PR commands sent, daemon guard on a
   dirty worktree (C-504).
4. Consequences: kind maps (branch prefix, chips) handle a third kind; the model never chooses it.

## Acceptance criteria
- [ ] `prisma migrate dev` applies `20261231000052_analysis_cards`; existing cards are unchanged.
- [ ] An e2e calls `card.finishAnalysis` from an analysis card's session: the round has the report, the card
      is in Finished, `collectState` stays `none`, no `card.collect`, review step or demo was sent (fake runner).
- [ ] A second finish after a feedback round replaces only the `pending` proposals.
- [ ] `dependsOn` naming a later or missing position is refused `invalid_args`; 21 proposals are refused.
- [ ] `finish_card` from an analysis card's session is refused `analysis_expected`; `card.finishAnalysis`
      from a feature card's session is refused `not_a_card_session`.
- [ ] Authorization: `GET board/cards/:number` returns `analysis` only to a member of the project (e2e with a
      user of another project gets 404, as for any card).
- [ ] The normalizer and capture contracts still reject `analysis` (unit tests in `packages/shared`).
- [ ] Every exhaustive map over `BoardCardKind` compiles with `analysis` (`bun run check`); the branch
      prefix of an analysis card is `card` (`packages/shared/src/board/naming.ts:64`).
- [ ] ADR-0126 is in `docs/adr/` and the ADR index.

## Risks
- Stack S-24 adds `task` to the same enums (`schema.prisma` `BoardCardKind`, `LOCAL_CARD_KINDS`). Whichever merges
  second rebases; the migrations are separate.
- About 20 sites branch on `kind === 'bug'` and treat everything else as a feature
  (e.g. [Confirmed] `apps/api/src/board/board-rounds.service.ts:1027,1037`). Each is checked; C-505 owns the
  round path.

## Open questions
- Proposal limit 20 per round? Default: 20.
