# C-510: Show task cards on the Board: create as Task, a clean face, a task sheet with checklist and Done

## Why
The API holds tasks (C-509), but the Board cannot create or show them. The person asked for a task card that reads as different from code cards at a glance, without adding clutter.

## What
- New card: Code | Task switch. Task asks for title, description, an assignee (default: you) and checklist lines.
- Face: a task icon in the header, one quiet line ("Waiting on Anna" / "Anna is on it" / "Done by Anna") instead of the run pill, and avatar + 2/4 where a code card has its PR and CI. Nothing added beyond that.
- Task sheet: assignee, checklist, what it unblocks, "Raised by C-n", Done (confirms if items are unticked), Reopen. No rounds, session or PR tabs.
- Dependants say "Waits for C-12 · Anna". No Run in a task's menu.

## Done when
- Create → tick → Done turns the dependent code card Ready, shown in a DemoFlow demo signed in via fragments/sign-in.json.
- Code card faces are unchanged.

Evidence: apps/web/src/components/board/card-face.tsx:36, card-face-icons.tsx:48

Spec: docs/specs/card-510-task-cards-on-the-board-and-sheet.md
