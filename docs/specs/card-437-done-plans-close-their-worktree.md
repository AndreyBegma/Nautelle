# C-437: A plan marked done sends `plan.close`, so its worktree goes

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
A plan's worktree (`.wt-<repo>-plan-<shortId>`) is removed when the plan is archived, or after 14 idle days. A plan
that ends as `done` — its cards were created, or every candidate was decided — sends nothing, so its worktree waits
two weeks. On the person's machine 59 plan worktrees were left on 2026-10-26.

## Scope
**In:** `apps/api/src/planner/plan-cards.service.ts`, `apps/api/src/planner/plan-candidates.service.ts`, the
existing `close` of `apps/api/src/planner/plan.service.ts` (moved to a provider both can inject if needed), e2e.
**Out:** the runner's idle cleanup and sweep of orphans (C-439).

## Current behaviour
- [Confirmed] `apps/api/src/planner/plan-cards.service.ts:173-176`: create cards sets `status: 'done'` and sends no
  command.
- [Confirmed] `apps/api/src/planner/plan-candidates.service.ts:531-537`: `closeIfDecided` sets `done` inside the
  transaction and sends no command.
- [Confirmed] `apps/api/src/planner/plan.service.ts:623-679`: `archive` calls `close`, a best-effort
  `plan.close {planId, projectId}`; a refusal is logged.
- [Confirmed] `apps/runner/src/planner/executor.ts:54-56`: the runner's idle cleanup is 14 days.

## Decisions
- D1. Whenever a plan becomes `done`, `plan.close` is sent **after** the transaction commits, best effort, as on
  archive. *Source: D15 of the planner spec (archive closes); the 2026-10-26 improvement plan.*
- D2. `closeIfDecided` returns whether it closed the plan; the caller sends `plan.close` after the commit for each
  plan it closed. No command is sent inside a transaction.
- D3. A runner that is offline leaves it to the runner's cleanup (C-439 sweeps it at the next start).

## Acceptance criteria
- [ ] Planner e2e: creating cards from a plan sends `plan.close` for that plan once, after the plan is `done`.
- [ ] Planner e2e: accepting or rejecting the last pending candidate sends `plan.close`; deciding one of several
      sends nothing.
- [ ] A `plan.close` that fails (runner offline) is logged and the plan is still `done`.
- [ ] `bun run check` and the api tests pass.

## Risks
- `plan.close` cancels a running turn in the plan. A `done` plan has no running turn: create cards and the last
  decision both require the plan to be `reviewing`.

## Open questions
- None.
