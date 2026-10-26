# C-419: Fold GitHub's Update branch merge into a live card branch instead of raising branch_diverged

Issue: #980

## Why
"Update branch" on a card's PR adds a base merge on top of the runner's push. The next push is refused, the remote tip is unknown to the runner, and the card gets branch_diverged. On 2026-10-25 C-400 lost a round this way.

## What
- pushCardBranch recognises a remote merge commit whose first parent is in HEAD and whose other parent is in origin/<base>, merges it (`git merge --no-edit`), and pushes.
- A conflicting merge aborts and raises branch_diverged as today. Rebase-style updates stay out.

## Done when
- Real-git unit: update-branch remote + local commit pushes a merge (throws today); foreign commits still throw; conflict aborts cleanly.

Evidence: apps/runner/src/cards/git.ts:135-196 (throw at 163-176); apps/api/src/board/board-work.ts:2117-2150

Spec: docs/specs/card-419-accept-github-update-branch-merges.md
