# C-441: A push that fails on SSH or auth re-checks `gh` and retries once; `status` shows the git auth mode

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
The runner decides once per (re)connect whether git goes over HTTPS with `gh`'s token or over the machine's own
setup (`native`). After a reboot `gh auth status` can fail at start (keyring not unlocked yet); the mode stays
`native`, the service has no SSH agent, and a card's collect fails on `git push` until the next reconnect. The
person cannot see which mode the runner is in.

## Scope
**In:** `apps/runner/src/git-auth.ts`, the `status` output in `apps/runner/src/cli.ts`, tests.
**Out:** the GitHub App path; any change to the git settings themselves.

## Current behaviour
- [Confirmed] `apps/runner/src/git-auth.ts:52-61`: `probe` runs `gh auth status --hostname github.com` and sets
  `gh` or `native`; it never throws.
- [Confirmed] `apps/runner/src/git-auth.ts:67-79`: `wrap` adds `GITHUB_GIT_CONFIG` only while the mode is `gh`.
- [Confirmed] `apps/runner/src/daemon.ts:223,862`: `probe` runs on each `hello` and once at start; nothing re-probes
  on a failure.
- [Confirmed] `apps/runner/src/cli.ts:385`: `status` prints config, connectivity and spool, not the git mode.

## Decisions
- D1. In `wrap`, a `git` call whose args are `push`, `fetch`, `pull` or `ls-remote` and that exits non-zero with
  stderr matching an SSH or auth failure (`Permission denied (publickey)`, `Host key verification failed`,
  `could not read Username`, `Authentication failed`, `terminal prompts disabled`) re-runs `probe`; when the mode
  changed, the call is run once more with the new settings. At most one retry per call. *Source: #329 D1; the
  2026-10-26 improvement plan.*
- D2. A re-probe is rate-limited to one per 30 s, so a broken setup does not run `gh` on every fetch.
- D3. `nautelle-runner status` prints `git auth: gh (github.com over HTTPS)` or `git auth: native` from its own
  probe, plus a hint to run `gh auth login` when native and `gh` is installed.

## Acceptance criteria
- [ ] `git-auth.spec.ts`: a push failing with `Permission denied (publickey)` while `native`, with `gh` now logged
      in, is retried once with `GITHUB_GIT_CONFIG` and succeeds. This is the test that would have caught the
      collect failure after reboot.
- [ ] A push failing with a non-auth error is not retried; a second auth failure within 30 s does not re-probe.
- [ ] `cli.spec.ts`: `status` shows each mode.
- [ ] `bun run check` and the runner tests pass.

## Risks
- A retried `push` could run twice if the first one partly succeeded; an auth failure happens before any ref is
  sent, so the retry is safe for the matched errors only.

## Open questions
- None.
