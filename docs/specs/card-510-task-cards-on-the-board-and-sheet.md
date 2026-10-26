# C-510: Task cards on the Board — create, face, sheet, checklist and Done

Stack **S-24 "Tasks for a person"**, stage 1. It needs the C-509 API. needsDesign.

## Summary
C-509 lets the API hold a task card. This card is the web side. In New card you pick **Code** or **Task**. A task reads differently from a code card at a glance, without adding clutter. Its sheet has an assignee, a checklist and **Done**.

## Scope
**In:** New card dialog, Board face, card sheet for a task, the card menu, the dependency icon text, a DemoFlow demo.
**Out:** the Inbox row (C-512), Telegram and MCP (C-513).

## Decisions
- D1 — The task face must look clean, read as different from code cards at a glance, and add no clutter. *The person, 2026-10-26 interview.*
- D2 — The difference comes from **replacing** the code-only signals, not from adding new ones. Today the face has a header (label, kind icon, design/dependency/demo icons, menu), title, one state signal, and a footer with the PR and CI dot (`apps/web/src/components/board/card-face.tsx:36-43` [Confirmed]). On a task:
  - **Header:** `KindIcon` draws a neutral `ListChecks` icon, named "Task". Today it draws only the Bug icon (`apps/web/src/components/board/card-face-icons.tsx:48-55` [Confirmed]). There are no design or demo icons.
  - **Status:** no run `StatusPill`. One quiet line instead: "Waiting on Anna", "Anna is on it" (In progress) or "Done by Anna". Unassigned shows "Unassigned" in the warn tone.
  - **Footer:** the assignee's glass-ui `Avatar` (xs) and the checklist count `2/4`, where a code card has its PR chip and CI dot. With no checklist, only the avatar shows.
  - Nothing else: no extra border, colour or badge. *This spec; the person's "without clutter".*
- D3 — A code card that waits on a task names the person. The dependency icon's tooltip, and the readiness line, say "Waits for C-12 · Anna" (from `CardDependencyRef.assigneeName`, C-509). *This spec.*
- D4 — Done with unticked items asks "2 items are not ticked — mark done anyway?" (C-509 D6). *This spec.*

## UI
Only glass-ui components (ADR-0011): `SegmentedControl`, `Avatar`, `Checkbox`, `Combobox`, `Button`, `Textarea` and `Dialog` are all listed in `docs/ui/glass-ui.md:90` and its tables [Confirmed]. A missing variant goes to glass-ui first.
- **New card** (`apps/web/src/components/board/new-card-dialog.tsx`): `SegmentedControl` **Code | Task** at the top, defaulting to Code. Task shows title, description, an **Assignee** `Combobox` and a **Checklist** editor (one line per item, Enter adds). The default assignee is the caller. Task hides the code-only fields: kind, model, effort, profile, issue/spec on Run, design. The members list comes from `GET projects/:id/members` (`apps/api/src/projects/projects.controller.ts:219` [Confirmed]).
- **Task sheet:** a new `apps/web/src/components/board/task-sheet.tsx`. `card-sheet.tsx` renders it for `kind === 'task'` and keeps its own tabs for code cards. It shows:
  - the title and description (reusing `card-description.tsx`);
  - the assignee, which an operator can change;
  - the checklist, where you tick, add, rename, reorder and delete items;
  - the dependants ("Unblocks C-41, C-42");
  - "Raised by C-40" with a link, when `raisedFor` is set;
  - a primary **Done**, with an optional note;
  - **Reopen** on a Done task.
  It has no Rounds, Session, PR, Demo, Cost or Design tabs.
- **Card menu:** a task offers Done, Reassign, Move and Delete. It never offers Run or the launch popover.
- **Viewer:** an assignee who is a viewer sees Done and the checkboxes on their own task. Everything else is read-only (C-509 D5).
- **Web client:** `apps/web/src/lib/board/actions.ts` gains `completeTask`, `reopenTask` and the checklist calls. A new `apps/web/src/lib/board/tasks.ts` holds the face text (`taskStatusLine`, `checklistCount`), with unit tests.

## Acceptance criteria
- [ ] New card → Task creates a task with an assignee and three checklist items. It appears in To Do with the task icon, "Waiting on <name>", the avatar and `0/3`, and no PR, CI or state pill.
- [ ] A code card next to it looks unchanged (visual check in the demo; `card-face.test.tsx` covers both faces).
- [ ] Ticking an item updates the face count live. Done with an unticked item asks to confirm. After Done the task is in Completed, showing "Done by <name>".
- [ ] A code card that depends on the task shows "Waits for C-<n> · <name>" before Done and Ready after.
- [ ] The task's card menu has no Run. A viewer who is not the assignee sees no Done.
- [ ] `bun run check` passes; there are new unit tests for `tasks.ts` and the task face.
- [ ] The DemoFlow demo `demoflow/cards/C-<n>-task-cards-on-the-board.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It creates a task with a checklist, makes a code card depend on it, ticks the items, presses Done, and shows the code card turning Ready.

## Risks
- `card-sheet.tsx` is 1 714 lines. Branch to `task-sheet.tsx` near the top rather than threading `isTask` through every tab.
