# C-511: A stuck code card raises a task for a person and resumes after Done

Stack **S-24 "Tasks for a person"**, stage 1. It needs the C-509 schema.

## Summary
Sometimes a card's worker cannot go on without a person: a credential is missing, a gate needs someone, or a step has to be done by hand. Today it stops, or it fails and the card gets `needsPerson`. The reasons for that flag are all CI, review, branch and round reasons (`packages/shared/src/board/types.ts:231-243` [Confirmed]), and none of them says *what* the person must do. This card gives the worker a tool, `need_person`. The tool creates a task for the right person, makes the code card depend on it and ends the round cleanly. When the task is Done, the code card runs again **in the same session** and is told what the person did.

## Scope
**In:** the worker MCP tool, the API method, ending the round, the dependency, resuming after Done, and the stack-run interplay.
**Out:** turning the existing automatic `needsPerson` reasons (CI, conflicts) into tasks. Those stay Inbox `failed` items (see Open questions). Notifying the assignee comes from C-512, which notifies on every task assignment.

## Decisions
- D1 — When a card needs a person, a task is created for that person, the code card depends on it, and after Done the code card continues by itself. *The person, 2026-10-26 interview (Q16 b).*
- D2 — The tool follows `escalate_card`, which is already offered only to card workers and makes the runner stop the session after it answers (`apps/runner/src/mcp/tools.ts:549-570`, `apps/runner/src/detect/capabilities.ts:346-347`, `apps/api/src/local/local-handlers.ts:212-249` [Confirmed]). The new tool `need_person` takes `{title ≤ 200, why ≤ 2 000, checklist?: string[] ≤ 30}` and calls the method `card.needPerson`. A runner advertises the new capability `cardNeedPerson`. A session that is not a card worker's is refused `not_a_card_session`. *This spec, after #750 D8.*
- D3 — The assignee is the first of these who is still on the project:
  1. the active round's author (`BoardCardRound.authorId`);
  2. the card's `autoRunArmedById`;
  3. the card's `createdById`;
  4. the project admin with the oldest membership.
  The worker never names a person. *This spec.*
- D4 — The round ends `finished` with `finishedBy: 'worker'`, never `ended`. The run queue pauses a stack run on an `ended` round (`apps/api/src/board/board-run-queue.ts:37`, `:455-468` [Confirmed]). The card goes back to the top of To Do with **no collect and no PR change**. It keeps its `sessionId`, branch and worktree, and the dependency to the task is added in the same transaction. *This spec.*
- D5 — Resume after Done:
  - If the card is in a running stack run, its run-queue entry goes back to `queued`. The queue's readiness check (`board-run-queue.ts:674-686` [Confirmed]) then starts it after Done.
  - Otherwise `autoRunWhenReady` is armed, with `autoRunArmedById` set to the round's author (or kept as it was when the round has no author), so the resumed Run runs as whoever ran the card (C-181). The auto-run then starts it on `onSatisfied` (`apps/api/src/board/board-auto-run.ts:41-61` [Confirmed]).
  The new round has trigger `task_done`, resumes the session, and its prompt carries the task's title, its checklist with ticks, and the Done note. *This spec; ADR-0127 §6.*
- D6 — One open raised task per card. A second `need_person` while one is open is refused `task_open`, with the open task's number. *This spec.*

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000054_task_done_round_trigger`: `CardRoundTrigger` += `task_done`. The task's `raisedForCardId` comes from C-509.

## API / runner
- `packages/shared/src/protocol/local.ts`: method `card.needPerson`, args and result `{number, task: number}`.
- `packages/shared/src/board/worker-prompt.ts`: one paragraph on when to call `need_person` (a missing secret or access, a manual step, a decision only a person may take) and when **not** to (a question the card already answers; use the question flow). Bump the prompt version.
- `apps/api/src/board/board-rounds.service.ts`: `needPersonByWorker` (D2–D6) and the `task_done` resume prompt.
- Audit: `card.task_raised` with the card and task numbers.

## Acceptance criteria
- [ ] e2e: a card worker calls `need_person`. A task appears assigned to the round's author, the code card depends on it, the code card is in To Do with its session kept, and no collect ran.
- [ ] e2e: Done on that task starts a `task_done` round that **resumes** the same `sessionId`, and its prompt contains the checklist and the note.
- [ ] e2e: the same flow inside a running stack run does not pause the run, and the later stages continue after Done.
- [ ] A second call while the task is open gets `task_open`. A manual session gets `not_a_card_session`.
- [ ] The runner offers `need_person` only to card worker sessions, and stops the session after the answer (runner unit test beside the `escalate_card` tests in `apps/runner/src/mcp/server.spec.ts`).
- [ ] An older runner without `cardNeedPerson` sees no change.

## Risks
- Whether a To Do card's worktree survives until the next Run is `[Unknown]`: the runner owns it (ADR-0001). If the runner prunes it, the resumed round recreates it from the branch. Verify this before relying on it.

## Open questions
- Should the automatic `needsPerson` reasons (for example `ci_not_reported`) also raise a task? Default: no; they stay Inbox `failed` items with Retry.
