# C-396: Onboarding to the first card: a full checklist, a repository picker and the setup link everywhere

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- The Getting started checklist (`apps/web/src/components/onboarding/steps.ts`) has these problems:
  - It ends at "Connect a project" and has no runtime profile step, although Run needs one.
  - Install and Pair share one `done` flag.
  - The optional steps are hard-coded to `done: false`, so they never tick.
- Connecting needs a typed absolute path (`apps/web/src/app/(app)/projects/connect-dialog.tsx`).
- On 2026-10-24, five projects had the wrong base branch, `main` instead of `develop`.
- Seven projects failed their first collect on a push over SSH.

## Decisions (grilling session)
- "A checklist up to the first card."
- "A repository picker in place of a path."
- "The /setup link without logs."

## What
1. **Checklist steps**, each ticked from real state, the optional ones included:
   - install;
   - pair a runner;
   - connect a project;
   - runtime profile;
   - Claude Code plugin;
   - push check;
   - first card reaching a PR.
2. **Connect:**
   - The runner lists the git repositories under its allowed roots (ADR-0047), and you pick one.
   - The runner detects the base branch: `develop` when it exists and is in use, otherwise the default branch.
   - A push check runs (`git push --dry-run`) and its result is reported.
   - If the push goes over SSH without an agent, the fix is suggested: an https insteadOf for that owner.
3. **The `/setup` link** also appears:
   - in the Helm NOTES (`deploy/helm/nautelle/templates/NOTES.txt`);
   - on a "no users yet" page served by the web app.

## Out of scope
- Pairing UX beyond the checklist.

## Touched areas
- `apps/web/src/components/onboarding/steps.ts`, `apps/web/src/app/(app)/projects/connect-dialog.tsx`
- Runner: new typed commands to list repositories and run the push check (`apps/runner/src/commands/`)
- `apps/api/src/projects/projects.service.ts` (connect, base branch)
- `deploy/helm/nautelle/templates/NOTES.txt`

## ADRs to read
- ADR-0001, ADR-0010 (typed command allowlist), ADR-0047 (runner-local policy), ADR-0087 (setup token),
  ADR-0077 (branch policy).
- No new ADR is needed. The new runner commands follow ADR-0010 and ADR-0023 (runners advertise their commands).

## Acceptance criteria
- [ ] A new install reaches a first card with a PR from the checklist, without reading docs.
- [ ] Connect offers a list of repositories and detects the base branch.
- [ ] A failed push check is reported with its fix before the first card runs.
- [ ] The optional steps tick when they are done.
- [ ] The setup link shows in the Helm NOTES and on the no-users page.

## Tests
- Runner: unit tests for the repository listing (allowed roots only) and the push check.
- API and web: the checklist states.

## Open questions
- None.
