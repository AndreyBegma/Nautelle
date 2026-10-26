# C-431: Design switches in the New card and quick card dialogs

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 3. Part of the 2026-10-26 improvement plan. Closes issue #274.

## Summary
A UI card that should get a design first is created and then opened again to turn on "Needs design". Issue #274 asks
for two switches at creation, and they are still missing.

## Current state
- [Confirmed] `CreateBoardCardDto` has `title, body, kind, issueOnRun, specOnRun, issueNumber, attachmentIds` and no
  design fields (`apps/api/src/board/dto.ts:86-123`); `continueAfterDesign` exists only on the update DTO (`:193-196`).
- [Confirmed] A card's design is turned on through `PATCH /projects/:id/board/cards/:n/design`
  (`apps/api/src/design/card-design.controller.ts:69-86`, `TaskDesignPatchDto`).
- [Confirmed] Issue #274 is open: "Needs design" and "Continue after design" (the second enabled only while the first
  is on).

## Decisions
- As issue #274 says: `designNeeded` and `continueAfterDesign` on create. With `designNeeded`, the card's design is
  created `needed: true` in the same transaction, the way `cardPatch` does it (the person, 2026-10-26 interview).
- Both dialogs get them: New card and quick card. Quick card shows them under "More".
- No ADR.

## API
- `CreateBoardCardDto` / `CreateBoardCardRequest` (`packages/shared/src/board/contracts.ts`): optional booleans;
  `continueAfterDesign` without `designNeeded` is 400.
- `BoardService.create` (`apps/api/src/board/board.service.ts:566-600`) sets `continueAfterDesign` and creates the
  design through the design store's existing helper.

## UI
- `apps/web/src/components/board/new-card-dialog.tsx` and `quick-card-dialog.tsx` (through
  `apps/web/src/lib/board/quick-card.ts`): two glass-ui `Switch` rows below Kind. Default off.

## Acceptance criteria
- [ ] e2e: create with `designNeeded: true` gives a card whose design is `needed`; Run is refused `design_not_approved`
      until it is approved.
- [ ] DTO spec: `continueAfterDesign` alone is 400.
- [ ] Web tests (`new-card-dialog.test.tsx` and the quick card test): the second switch is disabled until the first is
      on; the request carries both.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-design-switches-in-the-new-card-dialogs.demo.json` (sign-in fragment in
      `setup`).

## Open questions
- Default "Needs design" on for `kind: feature` in projects with a UI profile? Default: no.
