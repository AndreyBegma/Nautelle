# C-406: Housekeeping: wire the Steward digest panel, close shipped issues, update the PRD and roadmap

A standalone card, not in a stack. It runs when a slot is free.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- **An orphaned panel.** `DigestPanel` (`apps/web/src/components/steward/digest-panel.tsx:148`) is imported nowhere,
  so `GET …/steward/digest/latest` has no UI.
- **Shipped but still open.** Several issues are shipped and still open (#500, #886, #891 and others), because
  `Closes #n` does not fire on PRs into `develop`.
- **An outdated PRD.** `docs/product/prd.md:48` still lists "A task tracker of its own" as a non-goal, which the Board
  contradicts.
- **An outdated roadmap.** `docs/product/roadmap.md` stops at M4, and Codex M4 is frozen (spec 741).

## Decisions (grilling session)
- "Yes, a housekeeping card, without removing features."

## What
1. **The panel.** Show the Steward digest panel in Activity, and link it from Settings › Steward.
2. **Issues.** Close every issue already shipped. A shipped issue is one whose PR merged into `develop` with a
   `Closes` line. Each closing comment links the PR.
3. **The PRD.** Update it to the Board era: Nautelle has its own work board, GitHub issues stay one input, and the
   non-goals change accordingly.
4. **The roadmap.** Bring it to the Board era and to this plan's four stages, S-13 to S-16.

## Out of scope
- Any feature change.

## Touched areas
- `apps/web/src/components/steward/digest-panel.tsx`, the Activity page
- `docs/product/prd.md`, `docs/product/roadmap.md`
- GitHub issues, through `gh`

## ADRs to read
- ADR-0040 (Steward), ADR-0004 (GitHub issues are the task queue), ADR-0028 (one work surface).
- No new ADR is needed.

## Acceptance criteria
- [ ] Activity shows the latest Steward digest.
- [ ] The listed shipped issues are closed, each with a link to its PR.
- [ ] The PRD and the roadmap match the product and this plan.

## Tests
- Web: a test that the panel renders the digest and its empty state.

## Open questions
- None.
