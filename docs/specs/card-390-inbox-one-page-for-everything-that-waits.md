# C-390: Inbox: one page for everything that waits on you, across projects, with the action right there

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
What needs a person is split across:
- the bell;
- each project's Queue → Approvals tab (`apps/web/src/app/(app)/projects/[projectId]/queue/page.tsx`);
- card sheets ("The agent asks you", `apps/web/src/components/board/card-sheet.tsx`);
- the Fleet slot chat.

No single place shows it all.

## Decisions (grilling session)
- "A separate page, with the actions right there."
- "Only what waits for a decision." An item disappears once handled or once it no longer applies.
  Service failures go to Activity.

## What
1. **A workspace page Inbox in the rail**, with a count badge. The bell links to it. On a phone it sits in the capsule.
2. **Items**, across every project the user can see, each with its action in place:
   - a card session's question → its options as buttons, or free text (ADR-0094);
   - a tool-use request in away mode → Allow or Deny, plus the "allow similar" rules once C-401 lands;
   - a Finished card ready to merge → the demo video inline, CI and PR, Merge or Feedback;
   - a design waiting for approval → preview, Approve, Approve and run, Back with comment (C-394);
   - a card that needs a person (CI fix rounds used up, collect failed) → Retry or Open;
   - a setup blocker (no runtime profile, runner offline, push not possible) → a link to the fix.
3. **Grouping** by project, oldest first, with filters by kind.
4. **Live updates.** Handling an item anywhere (Board, Telegram, MCP) removes it here.
5. **Overview's "Needs you"** becomes a short preview of the Inbox.
6. **Telegram** keeps working as today.

## Out of scope
- New notification channels (C-404, C-405).
- Away-mode rules (C-401).

## Touched areas
- New route `apps/web/src/app/(app)/inbox/` and the nav entry in `apps/web/src/components/shell/nav.ts`
- `apps/web/src/components/overview/needs-you.tsx`
- API: a read that unifies questions, action requests, finished cards, designs, needs-person cards and setup blockers.
  The sources are `apps/api/src/approvals/approvals.service.ts`,
  `apps/api/src/session-message/session-message.service.ts` and `apps/api/src/board/board.service.ts`.
- Reuse the existing actions: card accept, session message, design approve, action request decide.

## ADRs to read
- ADR-0045 (messaging a running session), ADR-0052 (tool-use request preview), ADR-0094 (question reported on every
  project), ADR-0090 and ADR-0096 (demo on the card and in Telegram).
- No new ADR is needed. It is a new view over existing decisions.

## Acceptance criteria
- [ ] Every item kind above can be handled without leaving the Inbox.
- [ ] The count badge equals the number of items.
- [ ] Handling an item elsewhere removes it live.
- [ ] A viewer sees items but not actions their role cannot take.
- [ ] Screenshots in light, dark and phone width match the approved design.

## Tests
- API: e2e for the unified read, covering each kind, visibility per role and resolution.
- Web: tests for each item's action and for live removal.

## Open questions
- None.
