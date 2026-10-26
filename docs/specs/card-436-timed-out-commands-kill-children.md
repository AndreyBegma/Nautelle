# C-436: A runner command that times out kills the processes it started

Stack **S-18 "Sessions, terminal and runner"**, stage 0. Issue **#754** (follow-up of #740).

## Summary
The dispatcher aborts a command's `AbortSignal` on timeout (#740 D5), but no handler receives it: every handler
entry drops the second argument and `Exec` has no `signal` option. A timed-out `gh` or `git` child keeps running
after the API was told the command failed, and a retry can race it.

## Scope
**In:** `apps/runner/src/commands/handlers.ts`, `apps/runner/src/detect/exec.ts`, the handlers that spawn
processes: `apps/runner/src/commands/{queue,approvals,github,worktree}/**`, `apps/runner/src/control/`
(`orchestrator.ts`, `target.ts`, `tmux.ts`); their tests.
**Out:** card rounds, plan turns and skill runs (they have their own lifecycle and kill paths);
`control/tmux-server.ts` (it passes `ExecOptions` through unchanged).

## Current behaviour
- [Confirmed] `apps/runner/src/commands/dispatcher.ts:23-34,79-82`: handlers are typed `(args, signal?)` and the
  dispatcher passes `signal`.
- [Confirmed] `apps/runner/src/commands/handlers.ts`: the entries are `(args) => fn(args, deps)`; `signal` is
  discarded.
- [Confirmed] `apps/runner/src/detect/exec.ts:19-28,63-87`: `ExecOptions` has `timeoutMs` and `gitConfig`, no
  `signal`; `Bun.spawn` is started without one.

## Decisions
- D1. `ExecOptions.signal?: AbortSignal`. On abort the child gets `SIGKILL` (as the timeout does today) and the
  call resolves `null`. An already-aborted signal spawns nothing. *Source: #754 acceptance criteria.*
- D2. Every handler entry forwards `signal`; a handler that spawns passes it to each `exec` call.
- D3. A non-idempotent multi-step flow (`git push` then `gh pr create`; an issue create then its label) checks
  `signal.aborted` between steps and throws `CommandFailure('timeout', …)` without starting the next step.

## Acceptance criteria
- [ ] `exec.spec.ts`: a child that sleeps is killed when the signal aborts (its pid is gone), and the call
      resolves `null`; an aborted signal spawns nothing.
- [ ] `handlers.spec.ts`: a test asserts each handler receives the dispatcher's signal (the type does not catch a
      dropped argument).
- [ ] One test per family (queue, approvals, github, worktree, control): a command that times out kills its child
      process. These are the tests that would have caught #754.
- [ ] A multi-step github handler aborted after its first step does not run the second.
- [ ] `bun run check` and the runner tests pass.

## Risks
- A `git push` killed mid-way may leave a remote ref updated and no PR; D3 keeps the PR step from running on a
  stale assumption, and the next attempt sees the pushed ref.

## Open questions
- None.
