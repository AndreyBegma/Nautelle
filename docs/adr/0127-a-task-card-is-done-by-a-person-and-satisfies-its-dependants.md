# ADR-0127: A task card is done by a person and satisfies its dependants

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-509-task-card-kind-assignee-checklist-done.md`](../specs/card-509-task-card-kind-assignee-checklist-done.md) ·
Relates to: [ADR-0024](0024-board-cards-and-dedicated-card-workers.md), [ADR-0026](0026-card-capture-reads-opt-in-session-content.md), [ADR-0050](0050-viewers-read-session-content-and-action-request-input.md), [ADR-0065](0065-run-waits-for-every-dependency-to-have-a-ready-pull-request.md), [ADR-0126](0126-an-analysis-card-investigates-read-only-and-ends-with-proposed-cards.md) ·
Card: C-509 (stack S-24, stage 1)

## Context

Some work that blocks a code card is not code: add a secret to the vault,
approve a DNS change, ask legal. Until now every card on the Board was work for
a worker — a `feature` or a `bug` that ends in a pull request, or an `analysis`
that ends in a report (ADR-0126). Work a person does had no place on the Board.
It lived in chat or in someone's head, and a code card that depended on it was
either run too early or held back by hand.

The Board already has a dependency model (ADR-0065): a card waits until each
card it depends on is accepted, and Auto-run when ready starts it then. That
model does not care who did the work. What was missing is a card that a person
does and closes.

## Decision

1. **A fourth card kind, `task`.** It is a value of `BoardCardKind` and
   `BOARD_CARD_KINDS`, not a separate field. It is not in `WORK_CARD_KINDS`, so
   the kind normalizer, capture, quick-draft and triage — which only pick from
   that list — never produce it, and their output parsers refuse it. A task's
   `kindSource` is always `person`. Its kind is fixed when it is made: an edit
   that turns a task into a code card, or a code card into a task, is refused
   `422 task_field`; a person makes a new card instead. It is not in
   `LOCAL_CARD_KINDS` yet, so the runner's board tools leave tasks out until
   C-513 teaches them the kind.
2. **Its columns.** A task lives in Inbox (a candidate), To Do, In progress
   ("I'm on it", optional) and Completed (done). It never enters Finished,
   because Finished means "a pull request is ready"; a move there is refused
   `409 invalid_move`. A task holds an assignee, an optional checklist of at
   most 30 one-line items, and the note left with Done.
3. **Done is the accept path.** `POST …/done {note?}` moves the task from To Do
   or In progress to Completed through the same move as Accept, so the
   satisfied-dependency hook fires and a dependant with Auto-run when ready
   starts. Readiness does not change: Completed already satisfies a
   dependency, and a Completed card with no pull request counts as landed, so
   no dependant stacks on a branch. Unticked checklist items do not hold Done
   back. `POST …/reopen` moves a completed task back to the top of To Do and
   clears its note; its dependants wait again. Both are audited
   (`card.task_done`, `card.task_reopened`). A dependency ref to a task names
   its kind and assignee, so a dependant can say "waits for Anna".
4. **Who may act.** An operator or above creates and edits tasks, edits their
   checklists, and may press Done and Reopen on any task. The assignee may tick
   the checklist and press Done and Reopen on their **own** task whatever their
   role, so a viewer gets this one narrow write path; every other viewer gets
   `403`, and a user who is not on the project gets `404`. The assignee is a
   member of the project or an active admin, else `422 assignee_not_member`. A
   task outside the Inbox always has one; an Inbox candidate may have none, and
   accepting it assigns the person who accepts. When a member leaves the
   project, their open tasks become unassigned for an operator to reassign.
5. **Runner work never touches a task.** Run, Feedback, Message, Collect, Stop,
   Finish, design, assess, the demo and a worker's take refuse a task with
   `409 card_is_task`; the review step passes it; the run queue and Run stack
   never queue it. Its dependants still wait for it through the ordinary
   dependency, so a stack whose stage holds a task queues the next stage as
   waiting until the task is done.
6. **A worker may raise a task for a person (C-511).** A code card's worker that
   needs something only a person can do raises a task with `raisedForCardId`
   pointing at its card. The code card depends on the task and waits. After the
   task's Done, the code card resumes its own session rather than starting a
   fresh one, so the worker keeps its context.
7. **A task's notification goes to its assignee only (C-512).** Whatever
   event about a task notifies someone, it notifies the assignee, not the
   whole project; C-512 decides which events those are.

## Consequences

- Code and people share one dependency model: a code card waits on a task as it
  waits on another code card, and Done is all it takes to unblock it.
- A viewer can now change the Board, but only on a task assigned to them, and
  only its ticks, Done and Reopen. Every other write stays operator+.
- Every path that starts runner work has to exclude tasks. A new path that
  forgets is caught by `isRunnableCard`, the `card_is_task` guard and the
  compile errors a `switch` over `BoardCardKind` without a `task` arm raises.
- A task is not convertible to a code card. If the work turns out to need code,
  a person makes a new card and deletes the task.
