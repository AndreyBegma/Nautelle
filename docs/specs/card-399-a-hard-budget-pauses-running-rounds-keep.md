# C-399: A hard budget pauses running rounds, keeping their worktree and context, with one-click resume

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
The hard-stop check "never stops, kills or messages anything that is already running" (`apps/api/src/budgets/budget-gate.ts:20-28`), so one runaway round can blow past a hard stop.

## What
- When a hard budget is reached, running rounds in its scope are paused at a safe point: the session is interrupted and stopped (typed runner command), the worktree and the session's context stay. The card shows **Paused: budget**.
- **Resume** continues the same session once the budget allows (raised or a new period); a paused card counts in the run queue.
- Soft limits only warn, as today. Inbox and Telegram tell the person.

## Done when
A round that crosses the hard limit stops within a minute, resumes with its context, and nothing is lost.

Spec: docs/specs/card-399-a-hard-budget-pauses-running-rounds-keep.md (PR #937)
