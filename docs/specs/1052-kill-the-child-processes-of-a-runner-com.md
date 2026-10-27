# C-436: Kill the child processes of a runner command that timed out

Issue: #1052

## Why
The dispatcher aborts a command's signal on timeout (#740), but every handler drops it and `Exec` has no `signal`. A timed-out `gh`/`git` child keeps running after the API was told it failed.

## What
- `ExecOptions.signal`: abort kills the child (SIGKILL) and resolves null.
- Every handler forwards `signal`; spawning handlers pass it on.
- Multi-step flows (push then PR) check `signal.aborted` between steps.

## Coverage
- Under the signal: the handlers `createHandlers` builds inline, and the
  subsystem handlers that spawn short-lived `git` / `gh` children through their
  exec — `skill.inspect`, `skill.install`, `skill.list`, `repo.search`,
  `repo.read`, `uiprofile.fingerprint`, `docs.*`, `plan.publish_specs` and
  `plan.queue_issues`. Multi-step flows that push and then open a pull request
  (`plan.publish_specs`, `docs.publish_specs`, project `skill.install`) stop
  between steps once the signal aborted; their worktree cleanup runs without it.
- Out of scope: handlers that only start or stop work with its own lifecycle —
  tmux sessions and background runs (`card.run`, `card.review`, `card.stop`,
  `card.close`, `card.reviewStop`, `skill.run`, `plan.turn`, `uiprofile.build`,
  `uiprofile.learn`, `cards.extract`, `text.normalize`, `card.assess`,
  `code.ask`, `card.demo`, the Steward and handoff commands, `terminal.attach`,
  `session.message`). Their group types accept `signal` so the dispatcher can
  hand it over, but they do not act on it yet.
- Also out of scope: `card.collect`. It pushes and opens a pull request through
  the card executor, whose temporary-worktree cleanup (`collectBranch`) shares
  the same exec; binding the signal there needs the cleanup split off first,
  which is follow-up work for this stack.

## Done when
- One test per family (queue, approvals, github, worktree, control): a timed-out command kills its child.

Evidence: #754; apps/runner/src/commands/handlers.ts; apps/runner/src/detect/exec.ts:19-28,63-87.

Spec: docs/specs/card-436-timed-out-commands-kill-children.md
