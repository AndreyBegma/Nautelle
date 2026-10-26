# C-419: Accept GitHub's "Update branch" merge on a live card branch

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
When a person presses "Update branch" on a card's PR, GitHub adds a merge commit of the base onto the card branch. The
runner's next push is refused as non-fast-forward, the remote tip is neither the runner's own push nor in the reflog,
and the card gets `branch_diverged`. On 2026-10-25 C-400 lost a round this way. That merge is not someone else's work:
it is the runner's pushed head plus the base.

## Current state
- [Confirmed] `pushCardBranch` (`apps/runner/src/cards/git.ts:135-196`): on a non-fast-forward it fetches
  `origin/<branch>`; if the remote is not in HEAD and is neither `pushedHead` nor in the reflog, it throws
  `divergedBranchMessage` (`:163-176`).
- [Confirmed] The API turns that into `needsPerson: branch_diverged` (`apps/api/src/board/board-work.ts:2117-2150`),
  cleared by a later collect that succeeds (`:2085-2090`).

## Decisions
- An "update branch" remote is a merge commit whose first parent is in HEAD (the runner's pushed head or an ancestor)
  and whose other parent is an ancestor of `origin/<base>` after a fetch (the person, 2026-10-26 interview).
- Then the runner merges it: `git merge --no-edit --no-verify <remote>`. HEAD already has the first parent, so only the
  base's changes come in. The merge is pushed. A merge that conflicts is aborted and `branch_diverged` is raised as
  today.
- `pushCardBranch` needs the base branch: an optional `base` parameter. Both callers have it (`git.ts:771-777` passes
  `args.base`, `push.ts:173-181` `record.base`). No protocol change.

## Runner
- `apps/runner/src/cards/git.ts` and its callers (`git.ts`, `push.ts`): `isUpdateBranchMerge(deps, wt, remote, base)` using `git rev-list --parents -n 1`
  and `git merge-base --is-ancestor`; used before the divergence throw.

## Acceptance criteria
- [ ] Unit (`apps/runner/src/cards/push.spec.ts`, real git in a temp repo): push, then a base-merge commit on the
      remote, then a local commit; `pushCardBranch` pushes a merge and does not throw. Fails today with
      `divergedBranchMessage`.
- [ ] Unit: a remote commit by someone else (not a base merge) still throws.
- [ ] Unit: an update-branch merge that conflicts with the local commit aborts and throws; the worktree is clean.

## Risks
- Rebase-style "Update branch" (GitHub's rebase option) rewrites the runner's commits. It is not recognised and
  stays `branch_diverged`.

## Open questions
- None.
