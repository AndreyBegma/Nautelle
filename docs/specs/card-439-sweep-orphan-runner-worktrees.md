# C-439: The runner sweeps its orphaned plan and review worktrees at start

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
Plan and review worktrees that no record names are never removed: the idle cleanup only walks plans the runner
still has a record of, and review removal happens only on an explicit stop. On the person's machine there were 59
`.wt-<repo>-plan-*` and 16 `.wt-<repo>-review-*` worktrees on 2026-10-26. This card adds a start-up sweep, a
shorter plan TTL and one robust removal used by both.

## Scope
**In:** a new `apps/runner/src/worktrees/` module (`sweep.ts`, `remove.ts`), `apps/runner/src/planner/executor.ts`,
`apps/runner/src/cards/review.ts`, the call at start in `apps/runner/src/daemon.ts`, tests.
**Out:** card worktrees `.wt-<repo>-card-*` and fleet slot worktrees (never swept); the CLI (C-454).

## Current behaviour
- [Confirmed] `apps/runner/src/planner/executor.ts:54-56`: `PLAN_CLEANUP_MS` 1 h, `PLAN_IDLE_MS` 14 days.
- [Confirmed] `apps/runner/src/planner/executor.ts:370-390`: `cleanup` walks `this.store.plans()` only.
- [Confirmed] `apps/runner/src/planner/executor.ts:699-710`: plan removal is `git worktree remove --force` alone; a
  failure throws and leaves the directory.
- [Confirmed] `apps/runner/src/cards/review.ts:202-222`: review removal is `remove --force`, `prune`, then `rmSync`
  of what is left.
- [Confirmed] `apps/runner/src/planner/launch.ts:10-12`, `apps/runner/src/cards/review.ts:34-42`: the paths are
  `<parent>/.wt-<repo>-plan-<shortId>` and `<parent>/.wt-<repo>-review-<shortId>`.

## Decisions
- D1. **One removal.** `removeRunnerWorktree(deps, root, path)` in `worktrees/remove.ts` is today's review removal
  (remove `--force`, `prune`, directory fallback). Plan and review removal both use it.
- D2. **Start-up sweep.** After `plans.start()` and the card executor's start, for every watched project root: list
  `git worktree list --porcelain` and the root's parent for `.wt-<repo>-plan-*` and `.wt-<repo>-review-*`; remove
  each one that no plan record, active plan turn, card record or review record names. Then `git worktree prune`.
  Logged as one line per project with the count.
- D3. **Shorter plan TTL.** `PLAN_IDLE_MS` becomes 3 days. *Source: proposed here (see Open questions).*
- D4. Only the two runner-owned prefixes are ever swept; a directory that is not a worktree of the root and does not
  match the prefix exactly is left alone.

## Acceptance criteria
- [ ] `sweep.spec.ts` (temp git repo): orphaned plan and review worktrees are removed; one named by a plan record,
      a review record or an active turn stays; a `.wt-<repo>-card-*` and a slot worktree stay.
- [ ] A plan worktree whose `git worktree remove` fails is still removed by the fallback (planner test).
- [ ] The idle cleanup removes a plan idle for 3 days.
- [ ] `bun run check` and the runner tests pass.

## Risks
- A sweep that ran before a record was loaded would remove live work; D2 runs it after the stores are loaded, and
  a test starts the daemon with a live plan to prove it stays.

## Open questions
- Should the sweep also run periodically? Default: at start and in the existing hourly plan cleanup.
- Is 3 days the right plan TTL (D3)? Default: 3 days; a plan the person returns to after that only loses its
  worktree, which the next turn makes again.
