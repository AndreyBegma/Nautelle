# C-440: The runner update checks the new binary and points the service at it

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
The update offer runs `<manager> install -g nautelle-runner@<version>` and says "Updated" when it exits 0. It
never checks that the platform package with the binary came with it, and when the old binary path is gone (pnpm
keeps each version in its own directory) it only prints a command for the person to rewrite the unit. In a real
case an early install of the meta package left no binary, and the service failed on its next restart.

## Scope
**In:** `apps/runner/src/update/index.ts`, `apps/runner/src/update/install.ts`, a unit-writing helper beside
`serviceUnit` in `apps/runner/src/service.ts` (new function only), `apps/runner/npm/bin/nautelle-runner.js` (export
`resolveBinary` for reuse in its test only, no behaviour change), tests.
**Out:** a separate `nautelle-runner update` command (Open question); Homebrew (brew owns its keg).

## Current behaviour
- [Confirmed] `apps/runner/src/update/check.ts:61-79`: an update is offered only when the platform package is
  published at that version.
- [Confirmed] `apps/runner/src/update/index.ts:150-188`: after the install exits 0 it prints `Updated …` and
  `restartNotice`; nothing runs the new binary.
- [Confirmed] `apps/runner/src/update/index.ts:131-148` and `apps/runner/src/update/install.ts:80-100`: when the
  old binary is gone the notice prints `install-service && daemon-reload && restart` for the person to run.
- [Confirmed] `apps/runner/npm/bin/nautelle-runner.js:28-54`: the shim finds the binary in
  `nautelle-runner-<os>-<arch>`, and says optional dependencies were skipped when it is missing.

## Decisions
- D1. **Verify.** After the install, run `nautelle-runner version` (the shim on PATH) and require it to print the
  new version and exit 0. *Source: ADR-0017 (npm distribution), the 2026-10-26 improvement plan.*
- D2. **Repair once.** When D1 fails, install the platform package `nautelle-runner-<os>-<arch>@<version>`
  explicitly with the same manager and verify again. Still failing → print that the update is incomplete and the
  rollback command (`<manager> … nautelle-runner@<current>`); never print "Updated".
- D3. **Point the service at it.** When the unit (Linux) or launch agent (macOS) exists and its `ExecStart` /
  `ProgramArguments` binary no longer exists, rewrite it with the new binary path (the one D1 ran, resolved with
  `realpath`), then print only the restart command. ADR-0073's unit name is kept.

## Acceptance criteria
- [ ] `update.spec.ts`: an install after which `version` prints the old version runs the platform-package install
      and verifies again; both failing prints the rollback command and no "Updated". This is the test that would
      have caught the real case.
- [ ] `update.spec.ts`: an install that moved the binary rewrites the unit with the new path; one that kept it
      leaves the unit unchanged.
- [ ] macOS: the launch agent plist is rewritten the same way (fake fs).
- [ ] `bun run check` and the runner tests pass.

## Risks
- Running the shim spawns the new binary once; it only prints its version and touches no state.

## Open questions
- Add an explicit `nautelle-runner update` command? Default: no — the offer after a person's command stays the one
  entry point; a later card can add the command on top of this logic.
