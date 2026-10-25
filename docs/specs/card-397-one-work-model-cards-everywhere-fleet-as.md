# C-397: One work model: cards everywhere, Fleet as the live view of who works, Queue as incoming issues

Stack **S-14 "Core 2 — Daily flow"**, stage *Foundations*, with C-392. The *Features* stage builds on it.
The stack shares one design, which the person approves before the stack runs.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
Two work systems run side by side:
- The Board's create action is "New work", and it makes cards.
- Fleet and Queue say "New issue", and they make GitHub issues for orchestrator slots.
- Fleet cards are mirrored onto the Board but refuse moves ("A fleet card follows its slot", the `fleet_slot` refusal).
- The same entity has three names: Work in the nav, Board as the page title, New work for the action.
  List and Board toggles leave the project or dead-end ("pick a project first").

A person cannot tell which system is in charge.

## Decisions (grilling session)
- "Board is the only work model."
- "Rethink Fleet and Queue without deleting them": the pages stay and their role changes.
- Nothing is removed in this iteration.

## What
1. **One create action everywhere:** a card, either quick (C-391) or through the interview. Fleet and Queue lose
   "New issue" as their primary action.
2. **Fleet** becomes the live view of what runs now: card workers, orchestrator slots and sessions, each with its
   state and a link to its card.
3. **Queue** becomes incoming work: open GitHub issues (labelled, or all of them), each with **Make a card**.
   The orchestrator's ready-issue queue keeps working behind it.
4. **Slot cards move like any card.** A card mirrored from a slot accepts a move. The ADR decides what the move does:
   either it tells the slot, or it detaches the card from the slot.
5. **Naming.** Work is the cross-project list of cards. The List and Board toggles stay inside a project.

## Out of scope
- Removing the issue queue, the orchestrator or any page.
- The Inbox (C-390).

## Touched areas
- `apps/web/src/app/(app)/projects/[projectId]/fleet/page.tsx`, `apps/web/src/app/(app)/projects/[projectId]/queue/page.tsx`
- `apps/web/src/components/shell/nav.ts` (labels and the create action), `apps/web/src/components/board/board-view.tsx`
- `apps/api/src/fleet/board-fleet.service.ts` (the board mirror of slots) and the `fleet_slot` move refusal in `apps/api/src/board/board.service.ts`
- `apps/web/src/app/(app)/work/page.tsx` (naming, toggles)

## ADRs to read
- ADR-0004 (GitHub issues are the task queue), ADR-0005 (drive cs-orchestrator), ADR-0024 (board cards),
  ADR-0028 (one work surface), ADR-0030 (terminal and fleet work on the Board).
- **A new ADR is needed**: the Board is the only work model, and it amends ADR-0028 and ADR-0030.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] Every create entry point makes a card.
- [ ] Fleet's header says it shows what runs now, and every row links to its card.
- [ ] Queue lists open issues, and **Make a card** creates a card with the issue linked.
- [ ] Moving a slot card no longer returns `fleet_slot`. The move follows the ADR.
- [ ] Work, Board and List naming is consistent, and no toggle dead-ends.

## Tests
- e2e: making a card from an issue, and moving a slot card.
- Web: nav labels and toggles.

## Open questions
- What moving a slot card does: tell the slot, or detach it. Decide in the ADR, preferring the smallest change that
  keeps the orchestrator correct.
