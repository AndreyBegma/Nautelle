# C-400: Move a project to another runner

Stack **S-15 "Core 3 — Fleet scale"**, stage *Fleet*.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
A project is bound to exactly one runner: `Project.runnerId`, unique on `(runnerId, rootPath)` in
`apps/api/prisma/schema.prisma`. Changing machines means connecting the project again from scratch.

## Decisions (grilling session)
- "Move the project to another runner" now.
- A pool of runners per project comes later, for teams.

## What
1. **The action.** In Settings › General: **Move to another runner**.
   - Choose a paired runner and the project's path on it, with the repository picker from C-396.
   - The target runner validates the path: it is in the allowed roots, it is the same repository, and the push check
     passes.
2. **Refusals.** The move is blocked while rounds run. Cards keep their history.
3. **The old machine.** Its worktrees are listed for cleanup.
4. **Runtime profile.** It is chosen again from the target runner's profiles.
5. **Records.** The move is audited.

## Out of scope
- Several runners on one project, or splitting cards across machines.

## Touched areas
- `apps/api/src/projects/projects.service.ts` (the move), `apps/api/prisma/schema.prisma` if needed
- `apps/web/src/app/(app)/projects/[projectId]/settings/` (General)
- Runner: the validation reuses the C-396 repository and push-check commands

## ADRs to read
- ADR-0001 (control plane and per-machine runner), ADR-0047 (runner-local policy).
- **A new ADR is needed only if** the `(runnerId, rootPath)` rule changes. A move that rewrites both fields keeps it.

## Acceptance criteria
- [ ] A project moved to another runner runs its next card there.
- [ ] The move is refused while rounds run, or when the target path fails validation.
- [ ] The history of earlier rounds stays readable.

## Tests
- API: e2e for the move and each refusal.

## Open questions
- None.
