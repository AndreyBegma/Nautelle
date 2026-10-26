# C-439: Sweep orphaned plan and review worktrees at runner start and remove plan worktrees robustly

Issue: #1045

## Why
Plan and review worktrees that no record names are never removed; plan removal is a bare `git worktree remove --force` that fails and leaves the directory. 59 plan and 16 review leftovers on the person's machine.

## What
- One `removeRunnerWorktree` (remove --force, prune, directory fallback) for plans and reviews.
- A start-up sweep of `.wt-<repo>-plan-*`/`-review-*` that no plan, turn, card or review record names.
- Plan idle TTL 14 days -> 3 days.

## Done when
- Temp-repo tests: orphans removed; recorded ones, card and slot worktrees kept; a failed `remove` still cleans up.

Evidence: apps/runner/src/planner/executor.ts:54-56,370-390,699-710; apps/runner/src/cards/review.ts:202-222.

Spec: docs/specs/card-439-sweep-orphan-runner-worktrees.md
