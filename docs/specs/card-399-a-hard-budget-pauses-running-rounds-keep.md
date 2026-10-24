# C-399: A hard budget pauses running rounds, keeping their worktree and context, with one-click resume

Stack **S-15 "Core 3 — Fleet scale"**, stage *Fleet*.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
The hard-stop check "never stops, kills or messages anything that is already running"
(`apps/api/src/budgets/budget-gate.ts:20-28`). One runaway round can blow far past a hard stop.

## Decisions (grilling session)
- "Pause and keep." When the hard limit is reached, running rounds stop at a safe point. Their worktree and session
  context stay. A paused round continues with one button once the budget allows.

## What
1. **Pause at the limit.**
   - When a hard budget is reached, every running round in its scope is paused: card rounds, plans, designs, skills,
     schedules, steward.
   - The runner interrupts the session and stops it with a typed command (ADR-0010).
   - The worktree and the Claude session stay.
   - The card shows **Paused: budget**.
2. **Resume.**
   - **Resume** continues the same session, through a resume of the Claude session, once the budget allows: the
     limit was raised or a new period started.
   - A paused card counts in the run queue (C-398).
3. **Soft limits** only warn, as today.
4. **Notify.** The Inbox (C-390) and Telegram tell the person.

## Out of scope
- Per-user spending caps (ADR-0059 lists them as out of scope).

## Touched areas
- `apps/api/src/budgets/budget-gate.ts`, `apps/api/src/budgets/budget-sweep.ts`, `apps/api/src/budgets/budget-evaluator.ts`
- `apps/runner/src/cards/executor.ts` (a pause, and a resume of the same session)
- `packages/shared/src/board/types.ts` (the paused state)

## ADRs to read
- ADR-0009 (API-equivalent cost), ADR-0010 (typed commands), ADR-0042 (context handoff),
  ADR-0076 (model and effort fixed per session).
- **A new ADR is needed**: a hard budget pauses running work, and it amends the budget-gate behaviour.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] A round that crosses the hard limit stops within a minute.
- [ ] Resume continues with the same context, and nothing in the worktree is lost.
- [ ] Soft limits still only warn.
- [ ] The person is told in the Inbox and on Telegram.

## Tests
- API: e2e for crossing the limit while a round runs, and for resume after raising the limit.
- Runner: tests for pause and resume.

## Open questions
- What counts as the safe point: the end of the current tool call, or an interrupt at once. Prefer the end of the
  current tool call with a short timeout. Decide in the ADR.
