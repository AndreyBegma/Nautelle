# C-400: Move a project to another runner

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
A project is bound to exactly one runner (`Project.runnerId`, unique `(runnerId, rootPath)`), so changing machines means reconnecting from scratch. A pool of runners per project is out of scope for now.

## What
- In Settings › General: **Move to another runner**, choosing a paired runner and the project's path there (repository picker from the onboarding card, validated by the target runner).
- Blocked while rounds run; cards keep their history; worktrees on the old machine are listed for cleanup. Runtime profile re-chosen from the target runner's profiles.

## Done when
A project moved to another runner runs its next card there. e2e for the move and its refusals.

Spec: docs/specs/card-400-move-a-project-to-another-runner.md (PR #937)
