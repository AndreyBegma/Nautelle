# C-395: Project settings: search across every setting, and a "Ready to run" block on top

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- Project settings sit in 4 sections that hold about 15 former tabs
  (`apps/web/src/app/(app)/projects/[projectId]/settings/page.tsx`).
- The run-critical settings are scattered:
  - runtime profile;
  - base branch;
  - plugin checklist;
  - auto-merge;
  - review;
  - demo videos.
- Budgets and token saver each appear in 3–4 places.
- On 2026-10-24, seven projects could not run for lack of a runtime profile, and five had the wrong base branch.

## Decisions (grilling session)
- "Search plus what a run needs."
- Duplicated entry points are not removed, but each leads to one place where the setting is edited.

## What
1. **Search** over every project setting by label and help text, jumping to the setting.
   It is also reachable from ⌘K (C-393).
2. **A Ready to run block** at the top of Settings. Each line is green or carries a link to its fix:
   - runtime profile set;
   - base branch;
   - push access, from the runner;
   - Claude Code plugin set up;
   - demo videos: config present in the repository.
3. **One editing place per setting.** Duplicated entry points (Usage, Admin, the project's More) link to it.

## Out of scope
- Removing tabs or pages.

## Touched areas
- `apps/web/src/app/(app)/projects/[projectId]/settings/page.tsx` and its section components
- The project readiness read that the Board's readiness banner already uses
- The push check and the demo-config check, which come from the runner (C-396 adds the push check on connect)

## ADRs to read
- ADR-0001 (the control plane never reads the project's files; the runner reports), ADR-0010 (typed commands),
  ADR-0047 (runner-local policy).
- No new ADR is needed.

## Acceptance criteria
- [ ] Typing "budget" or "profile" finds the setting and jumps to it.
- [ ] A project that cannot run says why at the top of Settings, with a link to each fix.
- [ ] Each duplicated entry point leads to the single editing place.

## Tests
- Web: the search index covers every setting, and the Ready to run states.
- API: e2e for the readiness read, if it gains fields.

## Open questions
- None.
