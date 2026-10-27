# C-437: Send plan.close when a plan becomes done, so its worktree is removed

Issue: #1051

## Why
Only archiving a plan sends `plan.close`. A plan that ends `done` (cards created, or every candidate decided) keeps its worktree for 14 days; 59 plan worktrees were left on the person's machine on 2026-10-26.

## What
- Send `plan.close` after the transaction that sets `done`, best effort, as archive does.

## Done when
- Planner e2e: create cards and the last candidate decision each send `plan.close` once; a failure is logged and the plan stays `done`.

Evidence: apps/api/src/planner/plan-cards.service.ts:173-176; plan-candidates.service.ts:531-537; plan.service.ts:623-679.

Spec: docs/specs/card-437-done-plans-close-their-worktree.md
