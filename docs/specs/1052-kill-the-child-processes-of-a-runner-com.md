# C-436: Kill the child processes of a runner command that timed out

Issue: #1052

## Why
The dispatcher aborts a command's signal on timeout (#740), but every handler drops it and `Exec` has no `signal`. A timed-out `gh`/`git` child keeps running after the API was told it failed.

## What
- `ExecOptions.signal`: abort kills the child (SIGKILL) and resolves null.
- Every handler forwards `signal`; spawning handlers pass it on.
- Multi-step flows (push then PR) check `signal.aborted` between steps.

## Done when
- One test per family (queue, approvals, github, worktree, control): a timed-out command kills its child.

Evidence: #754; apps/runner/src/commands/handlers.ts; apps/runner/src/detect/exec.ts:19-28,63-87.

Spec: docs/specs/card-436-timed-out-commands-kill-children.md
