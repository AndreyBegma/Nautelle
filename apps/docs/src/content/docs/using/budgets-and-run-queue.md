---
title: Budgets and the run queue
description: How much the fleet may spend, what a reached hard budget pauses, and how many cards run at once.
sidebar:
  order: 4
---

Two limits decide what the fleet does on a busy day: how much it may spend, and
how many Board cards run at once. This page covers both, including the two
behaviors that surprise people: a reached hard budget pauses running card
rounds, and Run on a full Board queues the card instead of refusing it.

## Budgets

A budget caps spend for one **scope** over one **period**.

- **Scope.** A budget belongs to a **Project** or to a **User**. A project
  budget counts every priced request that belongs to the project, including
  fleet workers, orchestrator sessions, skill runs and sessions a person
  started there. A user budget counts the runs that user started: skill runs,
  board card rounds, plan and design turns, and an orchestrator session they
  started. Fleet workers and webhook runs count toward the project only.
- **Period.** **Daily**, **Weekly** or **Monthly**. A week starts on Monday.
  The period is cut in the budget's time zone, which defaults to
  `APP_TIMEZONE` (UTC when unset). When a period ends, the next one starts
  from zero; thresholds that fired and overrides do not carry over.
- **Limit and thresholds.** The limit is in US dollars, at the API-equivalent
  price. Requests with no known price count as zero and are shown next to the
  budget as "N unpriced requests". A notification goes out once per period at
  each threshold: 50 %, 80 % and 100 % by default.
- **Action.** **Alert only** notifies at each threshold and refuses nothing.
  **Stop new spend** is the hard budget: once the limit is used up, work in its
  scope is refused or paused as described below.

Only an admin edits budgets. Set a project budget under the project's
**Settings › Cost › Budget**, and any budget under **Admin › Budgets** (the
**New budget** button). **Usage** has a **Set a budget** button for the project
in view. Each budget shows its state: ok, warning, exceeded or overridden.

## When a hard budget is reached

A **Stop new spend** budget that is used up does two things.

**It refuses new starts.** New orchestrator starts and skill runs in its scope
fail with `budget_exceeded`, naming the budget and when it resets. Run on a
Board card is refused the same way.

**It pauses running card rounds.** Every Board card round that is running in the
scope is stopped, usually within a minute of the limit being crossed. A project
budget pauses that project's rounds; a user budget pauses the rounds that user
started. The card stays in **In progress** with its branch, its worktree and its
Claude session, and reads **Paused: budget**. Its Run button reads **Resume**.
The turn that was in flight is lost; the edits already on disk and the
session's context are not. You get one Inbox item and one Telegram message per
pause.

### What a hard budget does not stop

- Orchestrator workers and the fleet's slots keep running. Stopping one
  mid-edit leaves a half-written branch that the orchestrator resumes at full
  cost, so it is left alone.
- Terminal cards, skill runs that already started, and sessions a person runs
  in their own terminal are not stopped.
- An **Alert only** budget never pauses anything.

If you want a harder stop for those, stop the orchestrator or the slot yourself.

### Resume and override

Nothing resumes by itself: a card stays paused after the budget allows spend
again, because spending on that card now is your decision.

To continue, press **Resume**. It is a normal Run of the paused card and
continues the same Claude session. It is refused with `budget_exceeded` until
one of these holds:

- an admin raises the limit,
- an admin **Override**s the budget under **Admin › Budgets** (the dialog is
  titled **Override budget**; it takes an end time no later than the end of the
  period, and a reason), or
- the period resets.

An active override lifts the refusal of new starts and the pause alike;
thresholds still notify. An admin can revoke the override, and then starts are
refused again.

A paused card holds no worker slot. Resume takes a slot like any Run, so it
waits in the run queue when the Board is full.

## How many cards run at once

The Board runs at most a fixed number of card workers per project. Set it
under the project's **Settings › Automation › Board**, in **Workers at once**
(1 to 10, 3 by default). A project admin changes it; everyone else reads it.
The Board shows "N of M workers running" under its title.

### The run queue

When the Board is full, pressing Run on a card in **To Do** does not fail. The
card joins the **run queue** and starts when a slot frees up. Every way of
running a card does this: the web Run, Telegram, a person's session over MCP,
**Auto-run when ready**, and a design's **Continue**. Running a queued card
again leaves it queued once.

A queued card shows "Waiting for a slot" with its place on its face. The Board
header counts the queued cards, and **Fleet** lists them under Run queue after
the running work. A queued card offers **Stop**, which takes it out of the queue
without starting anything.

### Order

Queued cards start in **To Do order**: topmost first, then by card number. Drag
a card up in To Do to start it sooner. Cards of a stack run share this one
queue with single cards, so to start a stack first, drag its cards up.

A queued card whose dependency is not ready yet is waiting for it. It takes no
slot and lets the next card start, then starts once the dependency is ready and
a slot is free.

### What is still refused

- A card **outside To Do** is refused when the Board is full: re-running a
  Finished card, or retrying a card in In progress, answers `max_running`.
- A card with an **open dependency** is refused with `dependency_open` when you
  press Run, as it always was.
- If a queued card is refused for another reason when its turn comes (a budget,
  no usable profile, the design), it leaves the queue and the reason is stored
  on the card. An offline runner or a full Board just keeps it queued.
