# C-509: A task card — kind `task`, an assignee, a checklist and Done

Stack **S-24 "Tasks for a person"**, stage 0 (lead). Part of the 2026-10-26 improvement plan.

## Summary
Some work is not code: "add the secret", "approve the DNS change", "ask legal". Today every card is a code card — `BoardCardKind` is `feature | bug`, the branch prefix and the issue label (`apps/api/prisma/schema.prisma:3290-3294` [Confirmed]). This card adds a card kind `task`: no session, no runner, no PR, no demo. It has an assignee, an optional checklist and a Done action. Done moves it to Completed, which already satisfies a dependency, so a code card waiting on it may run. It also writes ADR-0127.

## Scope
**In:** schema, shared contracts, API (create, update, checklist, Done, Reopen), every guard that keeps a task away from runner work, readiness, ADR-0127.
**Out:** the web UI (C-510), Inbox and notifications (C-512), a worker raising a task (C-511), Telegram and MCP (C-513).

## Decisions
- D1 — A card kind `task`; no session, runner, PR or demo; an assignee who is a member of the project; an optional checklist; a Done button. *The person, 2026-10-26 interview (Q12).*
- D2 — `task` is a new value of `BoardCardKind`, not a new field. Its `kindSource` is always `person`: the kind normalizer and triage never set `task` or change it, and a task never becomes a code card or the reverse (the kind is fixed when the card is created). *This spec; ADR-0127.*
- D3 — Columns of a task: Inbox (a proposal), To Do, In progress ("I'm on it", optional) and Completed (Done). It never enters Finished: Finished means "a pull request is ready". A move of a task to Finished is refused `invalid_move`. *ADR-0127.*
- D4 — Done = a move to Completed by the assignee or an operator+. It runs the existing accept path, so `onSatisfied` fires and Auto-run when ready starts waiting dependants (`apps/api/src/board/board-work.ts:578-589` [Confirmed]). No change to readiness: Completed already satisfies (`packages/shared/src/board/dependencies.ts:61-67` [Confirmed]), and a Completed card with no PR is `landed`, so no stacking on its branch (`apps/api/src/board/board-dependencies.service.ts:75-78` [Confirmed]). *ADR-0065, ADR-0127.*
- D5 — A viewer who is the assignee may press Done, Reopen and tick the checklist of **their own** task. Nothing else changes for viewers. *ADR-0127.*
- D6 — Done with unticked items is allowed; the web asks for a confirmation (C-510). *The person stressed low friction; default chosen here.*
- D7 — An assignee must be visible on the project: a `ProjectMember`, or an active admin (`apps/api/src/projects/project-access.service.ts:54-63` [Confirmed]). A task outside the Inbox always has one. A candidate task (Inbox) may have none; Accept without one assigns the person who accepts. *This spec.*

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000053_task_cards`:
- `BoardCardKind` += `task`.
- `BoardCard.assigneeId String?` → `User`, `onDelete: SetNull`; index `(assigneeId, column)`. When the user is deleted or leaves the project, the task stays and shows "Unassigned"; an operator reassigns it.
- `BoardCard.taskNote String?` — the optional note given with Done, ≤ 2 000 characters.
- `BoardCard.raisedForCardId String?` → `BoardCard`, `onDelete: SetNull`: the code card that raised this task (written by C-511; null for every other task).
- New `BoardCardChecklistItem { id, cardId, position Float, text (≤ 200), doneAt?, doneById? }`, cascade on the card, `@@index([cardId, position])`, at most `TASK_CHECKLIST_MAX = 30` items per card.

Shared (`packages/shared/src/board/`): today `BOARD_CARD_KINDS = LOCAL_CARD_KINDS` (`packages/shared/src/board/types.ts:30` [Confirmed]). It becomes its own list, `[...LOCAL_CARD_KINDS, 'task']`. `CODE_CARD_KINDS = ['feature','bug']` stays the branch, issue and classifier list. `LOCAL_CARD_KINDS` (`packages/shared/src/protocol/local.ts:411` [Confirmed]) does not change here. New `task.ts`: limits, `isTaskCard`, `mayActOnTask(role, userId, card)`. `BoardCardView` / `BoardCardDetail` gain `assignee: {id, name} | null`, `checklist: {done, total}` (view) / items (detail), `taskNote`, `raisedFor: CardDependencyRef | null`. `CardDependencyRef` gains `kind` and `assigneeName`, so a dependant can show "waits for Anna".

## API
- A new `apps/api/src/board/board-tasks.ts` (`BoardTasks`) owns create, assign, checklist, Done and Reopen of a task; `BoardService` delegates `kind: 'task'` to it, so C-512, C-511 and C-513 extend one place.
- `POST board/cards` (`apps/api/src/board/board.controller.ts:223` [Confirmed], operator): `kind: 'task'` takes `assigneeId` (required unless `candidate`) and `checklist?: string[]`. It refuses `issueOnRun`, `specOnRun`, `issueNumber`, `model`, `effort` and `profileKey` with `422 task_field`.
- `PATCH board/cards/:number`: `assigneeId` (operator). The code-only fields are refused on a task.
- `POST board/cards/:number/checklist` (add), `PATCH …/checklist/:itemId` (text, done, position), `DELETE …/checklist/:itemId`. Ticking is assignee or operator+ (D5). Editing is operator+.
- `POST board/cards/:number/done {note?}` and `POST board/cards/:number/reopen`. Both are `@ProjectRole('viewer')` plus the D5 check in the service, and both are audited (`card.task_done`, `card.task_reopened`). Done moves the card to Completed (D4); Reopen moves it to To Do. A non-task card gets `409 not_a_task`. The existing `move` route keeps doing Completed for operators.
- These refuse a task with `409 card_is_task`: Run, Feedback, Message, Collect, Stop, Finish, design, `card.assess`, the review step, the demo, take and track. The run queue and Run stack never queue a task (`apps/api/src/board/board-run-queue.ts:256-259` queues every To Do card of the stack today [Confirmed]). Its dependants still wait for it through the ordinary dependency.
- Every new read or write checks the caller's project access first. A user who is not on the project gets 404, as today.

## Acceptance criteria
- [ ] Migration `20261231000053_task_cards` applies on a copy of develop's schema; `prisma migrate diff` is clean.
- [ ] A task can be created with an assignee and a checklist. With an assignee who is not on the project it is refused `422 assignee_not_member`.
- [ ] Run, Feedback, Collect, design and assess on a task each return `409 card_is_task`. Run stack skips the task and still queues its dependants as waiting.
- [ ] Done by the assignee moves the task to Completed. A dependant with Auto-run when ready on then starts (e2e `board-tasks.e2e.spec.ts`). A dependant without the switch reads `ready`.
- [ ] Authorization: a viewer who is the assignee may Done, Reopen and tick. A viewer who is not the assignee gets 403. A user who is not on the project gets 404.
- [ ] Moving a task to Finished is refused `invalid_move` (unit test in `packages/shared/src/board/moves.spec.ts`).
- [ ] The kind normalizer and triage never output `task`; a test feeds a task-like title and checks this.
- [ ] `docs/adr/0127-a-task-card-is-done-by-a-person-and-satisfies-its-dependants.md` is written, covering D1–D7 and the C-511 resume rule.

## ADR-0127 outline
*A task card is done by a person and satisfies its dependants.* Context: non-code work blocks code cards and has no place on the Board. Decision: (1) kind `task` (D2); (2) its columns (D3); (3) Done is the accept path, and readiness does not change (D4); (4) who may act (D5, D7); (5) runner work never touches a task (the refusal list above); (6) a code card's worker may raise a task for a person; the card waits on it and resumes its own session after Done (C-511); (7) a task's notification goes to its assignee only (C-512). Consequences: one dependency model for code and people; a viewer gets a narrow write path.

## Risks
- S-23 (analysis cards) may add its own `BoardCardKind` value in a parallel migration. Two `ALTER TYPE … ADD VALUE` migrations both apply, but the enum lines in `schema.prisma` conflict textually. Whoever merges second rebases.
- `kind` is read as a branch prefix in many places. A `switch` over `BoardCardKind` without a `task` arm is a compile error, which is wanted. Fix each one by excluding tasks, not by giving tasks a prefix.

## Open questions
- Should a task be convertible to a code card later? Default: no. Create a new card and delete the task.
