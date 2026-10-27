# C-441: Re-check gh and retry once when a git push fails on SSH or auth; show the git auth mode in status

Issue: #1041

## Why
The git auth mode (`gh` or `native`) is probed per connect. After a reboot `gh auth status` can fail at start; git stays `native`, the service has no SSH agent, and card collect fails on push until the next reconnect. `status` does not show the mode.

## What
- A push/fetch failing with an SSH or auth error re-probes (rate-limited) and retries once when the mode changed.
- `nautelle-runner status` prints the git auth mode.

## Done when
- A `Permission denied (publickey)` push while `native`, with `gh` now logged in, succeeds on the retry; non-auth errors are not retried.

Evidence: apps/runner/src/git-auth.ts:52-79; apps/runner/src/daemon.ts:223,862.

Spec: docs/specs/card-441-git-auth-reprobe-on-push-failure.md
