# ADR-0101: A reached hard budget pauses running card rounds, and Resume continues the session

Status: accepted · Date: 2026-10-25 ·
Card: C-399 ·
Spec: [`docs/specs/card-399-a-hard-budget-pauses-running-rounds-keep.md`](../specs/card-399-a-hard-budget-pauses-running-rounds-keep.md) ·
Amends: [spec 28](../specs/28-budgets.md) D7 ·
Relates to: [ADR-0024](0024-board-cards-and-dedicated-card-workers.md), [ADR-0010](0010-typed-command-allowlist-on-the-runner.md), [ADR-0014](0014-server-originated-events-live-in-events.md)

## Context

Spec 28 D7 makes a `stop` budget mean "no new spend": `BudgetGate` refuses new
starts, and nothing that already runs is stopped, killed or messaged. The
reason was the orchestrator's workers: a worker killed mid-edit leaves a
half-written branch that the orchestrator later resumes at full cost.

Board card workers (ADR-0024) are different. Nautelle starts them itself, keeps
their worktree when a round stops (`card.stop`), and starts the next round in
the same Claude session (`session.resume`). Stopping one loses nothing but the
turn in flight, and Resume picks up the context. Meanwhile one long card round
can spend well past a hard limit, since the gate only refuses the next start.

## Decision

1. **Scope.** When a `stop` budget is reached, the running *board card rounds*
   in its scope are paused: a project budget pauses that project's rounds, a
   user budget pauses the rounds whose run counts toward that user
   (`runs.triggeredById`, spec 28 D3). Orchestrator slots, fleet and terminal
   cards, skill runs and a person's own sessions keep D7: they are not stopped.
   An `alert` budget only warns, and an active override lifts the pause as it
   lifts the gate.
2. **Trigger.** `BudgetEvaluator` emits a stop through an in-process hub
   (`BudgetStops`) after every evaluation of an enabled `stop` budget whose
   current period is used up with no active override. The board subscribes
   (`BoardBudgetPause`). Evaluation already runs 30 s after a usage batch and on
   the 5-minute sweep, so a round that crosses the limit is paused within a
   minute. The emit is repeated on each evaluation and the pause is idempotent:
   a round that is no longer active is skipped, and a round the runner could not
   stop stays running and is paused on the next evaluation.
3. **Pause is `card.stop`.** The runner gets the typed `card.stop` command it
   already has (ADR-0010); it interrupts and stops the session and keeps the
   worktree. No new runner command.
4. **The paused state is a stopped round with a reason.** The round ends
   `cancelled` with `pausedFor = budget` (a new nullable enum column on
   `board_card_rounds`), its run ends `abandoned` with the outcome "Paused: a
   hard budget was reached", and the card stays In progress with its branch and
   session. The card face, the card sheet and Telegram read **Paused: budget**,
   and the Run button reads **Resume**.
5. **Resume is Run.** Resume is the existing Run of an In progress card whose
   round is not active: the next round resumes the same Claude session. The
   budget gate refuses it with `409 budget_exceeded` until the limit is raised,
   an override is granted or the period resets.
6. **The person is told once per pause.** The pause writes a `card.paused`
   server event (ADR-0014) with the card, the round and the budget; it becomes
   an Inbox item and a Telegram message (notification kind `card.paused`, on for
   both channels by default) and an audit row by the system actor.
7. **The run queue.** A paused card holds no worker slot. Resuming it takes a
   slot like any Run, so it competes for room within the project's agent limit
   (and waits in the run queue once one exists).

## Consequences

- A hard budget bounds a card round's overshoot to about one evaluation
  interval, instead of the whole round.
- The turn in flight when the round stops is lost; the edits already on disk
  and the session's context are not.
- A paused card stays paused after the budget allows again: a person resumes
  it. Nothing resumes on its own.
- Spec 28 D7, its acceptance line on runner commands and the fleet banner text
  now hold for everything except board card rounds.
- Rejected:
  - **A new runner `card.pause` command.** `card.stop` already keeps the
    worktree and the session; a second command would duplicate it.
  - **A new `paused` round phase.** Every phase check (active, retry, stack
    progress, Telegram) would need to learn it; a stopped round with a reason
    reuses the existing Run-again path.
  - **Resuming automatically when the budget allows.** A raised limit or a new
    period is not a person's decision to spend on that card now, and the run
    queue decides who gets the room.
  - **Pausing orchestrator workers too.** Spec 28 D7's reason still holds for
    them: the orchestrator resumes a killed worker at full cost.
  - **Carrying the paused round's permission mode into Resume.** Resume uses
    the mode a Run would; a copied `bypassPermissions` would refuse a
    non-admin's Resume.
