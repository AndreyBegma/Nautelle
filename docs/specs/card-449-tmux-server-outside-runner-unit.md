# C-449: A tmux server inside the runner's unit is reported, and the unit no longer kills it

Stack **S-18 "Sessions, terminal and runner"**, stage 1.

## Summary
#327 starts a new tmux server in its own systemd scope, so a restart of the runner's unit does not kill every card
worker and slot. A server that already runs is reused whatever cgroup it is in — including one the runner forked
inside its own unit before #327, or one started by a hand-run `nautelle-runner run` under the service. That server
dies on the next upgrade, and nothing says so beforehand.

## Scope
**In:** `apps/runner/src/control/tmux-server.ts`, `serviceUnit` in `apps/runner/src/service.ts`, the call at daemon
start, tests.
**Out:** moving a running server (impossible without killing its sessions); macOS (launchd has no cgroups).

## Current behaviour
- [Confirmed] `apps/runner/src/control/tmux-server.ts:34-47,75-76`: under systemd a `new-session` with no server
  runs inside `systemd-run --user --scope`; when `tmux list-sessions` succeeds, the existing server is reused
  without a check.
- [Confirmed] `apps/runner/src/service.ts:44-66`: the unit has `Restart=on-failure` and no `KillMode`, so systemd's
  default `control-group` kills every process in the unit's cgroup on stop.

## Decisions
- D1. **Detect.** At daemon start under systemd, and when the guard first sees a running server: read the server's
  pid (`tmux display-message -p '#{pid}'` on the runner's server args) and `/proc/<pid>/cgroup`. When it lies in
  the runner's own unit (`INVOCATION_ID`'s unit, read from `/proc/self/cgroup`), log one warning naming the risk and
  the remedy: "stop the card sessions, then `tmux kill-server`; the next session starts outside the unit". Once per
  daemon start.
- D2. **Backstop.** `serviceUnit` adds `KillMode=process`: a stop or restart signals only the runner's main
  process; anything else left in the cgroup survives. *Source: #327 (a unit restart must not kill sessions),
  ADR-0017 (every upgrade restarts the unit).*
- D3. `install-service` writes the new unit; an existing install keeps the old one until it runs again. The
  release note of the version that ships this says to rerun `install-service` (not part of this card).

## Acceptance criteria
- [ ] `tmux-server.spec.ts` (fake exec and fake `/proc` reader): a server in the runner's cgroup logs the warning
      once; one in its own scope logs nothing; outside systemd nothing is read.
- [ ] `service.spec.ts`: the unit has `KillMode=process`.
- [ ] `bun run check` and the runner tests pass.

## Risks
- With `KillMode=process`, short-lived children of the runner (a `git` probe) may outlive a stop by a few seconds.
  They exit on their own; C-436's abort already kills command children on timeout.

## Open questions
- Show the warning on the runner's page in the web app too? Default: no — the journal only; a later card can report
  it in `hello`.
