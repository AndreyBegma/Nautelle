# C-440: Make the runner update check the new binary and point the service at it

Issue: #1043

## Why
The update offer says 'Updated' as soon as the package manager exits 0. It never checks the binary came with it, and when the old path is gone it only prints a command to rewrite the unit. In a real case an early meta-package install left no binary and the service failed on restart.

## What
- Run `nautelle-runner version` after the install; on mismatch install the platform package explicitly and check again; otherwise print the rollback, never 'Updated'.
- Rewrite the systemd unit / launch agent when its binary path no longer exists.

## Done when
- Update tests for verify, repair, rollback and unit rewrite (Linux and macOS).

Evidence: apps/runner/src/update/index.ts:131-188; update/install.ts:48-60,80-100; ADR-0017.

Spec: docs/specs/card-440-update-verifies-binary-and-unit.md
