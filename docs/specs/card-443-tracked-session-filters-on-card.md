# C-443: A terminal card's sheet shows its tracked session's filters

Stack **S-18 "Sessions, terminal and runner"**, stage 0. Issue **#767** (follow-up of #748).

## Summary
A card counts its tracked `/cs-eco` session's saving in its figure, but the sheet lists filters per round only. A
terminal card has no rounds, so its sheet shows a saving with no breakdown. The API already computes the
per-session breakdown.

## Scope
**In:** the card view in `packages/shared/src/board/contracts.ts`, `apps/api/src/board/board-mapper.ts`,
`apps/web/src/components/board/card-sheet.tsx`, tests, a DemoFlow demo.
**Out:** filters of sessions the card does not track.

## Current behaviour
- [Confirmed] `packages/shared/src/board/contracts.ts:543`: `tokenSaverFilters` exists on the round view only.
- [Confirmed] `apps/api/src/token-saver/token-saver-facts.ts:446-501`: `tokenSaverFiltersBySession` is computed.
- [Confirmed] `apps/api/src/board/board-mapper.ts:603-605`: the card's figure adds `tokenSavedBySession` for
  `trackedSessionId`; `:825` fills the round's filters only.
- [Confirmed] `apps/web/src/components/board/card-sheet.tsx:300-302`: `FilterBreakdown` is rendered per round.

## Decisions
- D1. The card view gains optional `trackedSessionFilters?: TokenSaverFilterSavings[]`, filled from
  `tokenSaverFiltersBySession.get(card.trackedSessionId)` — for any card with a tracked session. Additive.
  *Source: #767.*
- D2. The facts are already scoped to the card's project; no new query.

## UI
In the card sheet, a **Tracked session** block with the existing `FilterBreakdown`, shown when the list is not
empty. No new component.

## Acceptance criteria
- [ ] Board e2e: a terminal card tracking a session with filter stats returns `trackedSessionFilters`; a card with
      no tracked session returns none.
- [ ] Authorization e2e: a card in project A tracking a session id that has stats in project B returns no filters
      of B.
- [ ] `card-sheet` test: the block renders with the breakdown and is absent for an empty list.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-tracked-session-filters-on-card.demo.json` (sign-in through
      `demoflow/fragments/sign-in.json` in `setup`): open a terminal card and show the block.
- [ ] `bun run check` and the api and web tests pass.

## Risks
- None beyond a slightly larger card payload.

## Open questions
- None.
