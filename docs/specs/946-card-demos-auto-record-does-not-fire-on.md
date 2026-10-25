# C-408: Card demos: auto-record does not fire on green feature cards, and card worktrees lack apps/api/.env for demo-dev

Issue: #946

## What happened (2026-10-25, Nautelle project, demoVideosEnabled = true, runner devbox, DemoFlow 0.6.0)

1. **No auto demo.** C-392 (PR #940) and C-388 (PR #934) are `feature` cards whose PRs touch `apps/web/**` and carry a scenario in `demoflow/cards/`. Their PR heads went green, but `GET /board/cards/:n/demos` stayed `[]`: no row, no skip reason. The project's `cardMergePolicy` is `ask`. Per code reading, auto-record is called from the green-head ship path (`apps/api/src/board/board-shipping.ts:554` → `recordDemo` → `CardDemosService.autoRecord`, `apps/api/src/demos/card-demos.service.ts:321`), and its early returns log nothing. Find which gate returned and fix it so every green feature card touching UI paths gets a demo whatever the merge policy is. Make every silent skip leave a reason (a `skipped` row or at least a log line).
2. **demo-dev cannot start in card worktrees.** A manual "Record again" on C-392 failed: `DemoFlow readiness failed: devCommand did not start the app: it exited with code 1 … demo-dev: apps/api/.env is missing; copy the dev one into this worktree`. Of six card worktrees, three had `apps/api/.env` and three did not; the ones that had it were copied by their worker for tests. The demo must not depend on that. Either the runner provisions the env the demo needs into the card worktree before `card.demo` (from the project's configured source), or `scripts/demo-dev.sh` works from the Demo env without `apps/api/.env`. Decide by what ADR-0001/0010 allow; the control plane must not read the project's filesystem.

## Done when
- A green feature card with UI changes gets a demo row automatically under the `ask` merge policy too (a test pins it).
- Every auto-record skip is visible with its reason.
- A demo recorded in a fresh card worktree with no `apps/api/.env` starts the app and reaches `ready` (or the runner provisions the file first). A test or a documented e2e run proves it.
- `bun run check` and the api/runner tests pass.
