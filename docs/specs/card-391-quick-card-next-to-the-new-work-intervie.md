# C-391: Quick card next to the New work interview: text → To Do, optional run

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
Creating and running a card takes about 7 clicks plus an LLM planner turn. `NewCardDialog` always runs the intake
(`apps/web/src/components/board/new-card-dialog.tsx`).

## Decisions (grilling session)
- "Interview plus a quick-card button." The interview stays the default for big work and stacks.
- "Text → To Do, Run by a checkbox." A cheap model fills in the title and kind.

## What
1. In New work, a **Quick card** action beside the interview.
2. **One text field** plus attachments.
3. **A cheap model call** fills the title and the kind (feature or bug), both editable before saving.
   - It goes through the LLM gateway, like the other assistant features (ADR-0059).
   - Without a provider, the title falls back to the first line and the kind to feature.
4. **A Run now checkbox.**
   - It starts the card when a slot is free.
   - Otherwise it puts the card into the run queue (C-398).
   - Until C-398 lands, it shows the existing refusal reason.
5. **Also reachable** from ⌘K (C-393) and the phone `+` button.

## Out of scope
- Changing the interview itself.

## Touched areas
- `apps/web/src/components/board/new-card-dialog.tsx`
- `apps/api/src/board/board.controller.ts` (`POST board/cards`; a small endpoint for the title and kind suggestion)
- The LLM gateway feature list (a new `quick_card` feature)

## ADRs to read
- ADR-0037 (one intake that can split), ADR-0058 (new-work cards are candidates until accepted),
  ADR-0059 (LLM providers for assistant features).
- No new ADR is needed. A quick card goes straight to To Do, because the person typed it and chose quick.

## Acceptance criteria
- [ ] Typing and pressing Enter creates a card in To Do in one step.
- [ ] With Run now, the card runs, or it queues once C-398 lands.
- [ ] The suggested title and kind are editable, and without a provider the fallbacks apply.
- [ ] It is reachable from ⌘K and the phone `+` button.

## Tests
- API: e2e for the suggestion endpoint, both with a provider and as the fallback.
- Web: tests for the dialog states, with and without Run now.

## Open questions
- None.
