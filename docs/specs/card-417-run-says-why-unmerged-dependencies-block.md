# C-417: Run says why when two dependencies are Finished but unmerged

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
A card that depends on two or more Finished, unmerged cards shows Ready and an enabled Run, and pressing it is refused
`dependencies_unmerged` (ADR-0065 Consequences). Readiness now knows this case: Run is disabled with the reason, and
the chip says which cards must merge first.

## Current state
- [Confirmed] `cardReadiness` is `ready` once every dependency is in Finished or Completed
  (`packages/shared/src/board/dependencies.ts:61-90`); `CardDependencyRef` has only `number, label, column`
  (`packages/shared/src/board/contracts.ts:413-419`).
- [Confirmed] The refusal is `apps/api/src/board/board-dependencies.service.ts:254-266` (more than one dependency
  that has not `landed`, `:75-78`).
- [Confirmed] Web disables Run through `runWaitsFor` (`apps/web/src/lib/board/dependencies.ts:76-81`), which only
  looks at open dependencies; `describeBoardError` explains the refusal after the click
  (`apps/web/src/lib/board/format.ts:466-479`).

## Decisions
- `CardDependencyRef.landed: boolean`, the service's `landed` rule. `CardReadiness.state` gains `'blocked'`: every
  dependency is satisfied but more than one has not landed (the person, 2026-10-26 interview).
- Auto-run when ready does not fire on `blocked`; the card waits until one is merged.
- No ADR: it implements ADR-0065's own consequence.

## API / UI
- `board-mapper.ts` and `board-dependencies.service.ts` (`refOf`) fill `landed`.
- `runWaitsFor` returns "C-1 and C-2 are not merged yet; a card branches from one dependency only" for `blocked`;
  `readinessChip` shows "Blocked · merge one of C-1, C-2" (warn); `autoRunNote` explains it.

## Acceptance criteria
- [ ] Unit (`packages/shared/src/board/dependencies.spec.ts`): two Finished unmerged dependencies → `blocked`; one
      merged → `ready`.
- [ ] Web test: Run is disabled with the reason as its title; the chip reads Blocked.
- [ ] e2e: the board view of such a card has `readiness.state === 'blocked'`.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-run-says-why-unmerged-dependencies-block.demo.json` (sign-in fragment in
      `setup`).

## Open questions
- None.
