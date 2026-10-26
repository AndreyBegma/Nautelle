# C-425: Retry buttons in the card sheet

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
C-421 adds `POST /board/cards/:number/retry`. The card sheet's needs-person banner now offers the action that fits
the reason, so a person can unstick a card without starting a round.

## Current state
- [Confirmed] The sheet shows the needs-person reason as text only (`apps/web/src/lib/board/shipping.ts:77-90,267`,
  used by `apps/web/src/components/board/card-sheet.tsx`).
- [Unknown] Until C-421 merges, the route does not exist.

## Decisions
- Buttons by reason (the person, 2026-10-26 interview):
  - `ci_not_reported`, `ci_still_failing`, `ci_not_green`: **Re-check CI** (`ci`);
  - `review_failed`: **Retry review step** (`review`);
  - every reason: **Clear flag** (`clear`), secondary, with a confirm that says automation resumes.
- Operators and admins only; viewers see the text.
- glass-ui `Button` and `ConfirmDialog` (ADR-0011); nothing new is written here.

## UI
- `card-sheet.tsx`: the buttons sit under the needs-person banner. While a request runs they are busy; a refusal shows
  through `describeBoardError` (`nothing_to_retry` gets a sentence in `apps/web/src/lib/board/format.ts` or the
  shared error text).
- Client call in `apps/web/src/lib/board/actions.ts`, wired through `use-card-actions.tsx`.

## Acceptance criteria
- [ ] Web test: each reason shows the right buttons; a viewer sees none.
- [ ] Web test: Clear flag asks first; Retry review step posts `{action: 'review'}`.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-card-sheet-retry-buttons.demo.json` (sign-in fragment in `setup`) shows a
      `review_failed` card retried.

## Open questions
- The same buttons on the card face? Default: no, the sheet only.
