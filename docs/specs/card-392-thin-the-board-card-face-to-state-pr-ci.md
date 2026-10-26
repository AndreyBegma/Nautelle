# C-392: Thin the board card face to state, PR/CI and demo/design/dependency icons

Stack **S-14 "Core 2 — Daily flow"**, stage *Foundations* (with C-397). It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
A tile stacks up to about 15 chips: Bug, deps, cost, Saved ≈ tok·$, Steward, handoff, Demo, Design, round pill,
hooks, Didn't start, CI dot, sub-state, Auto-run, Ready/Waiting. Most of them are rules of the Board row in
`docs/ui/screens.md` (about 21 KB). The face is hard to scan.

## Decisions (grilling session)
- The face keeps three things:
  - **state and "waits for you"**;
  - **PR and CI**;
  - **demo, design and dependency icons**.
- Cost and the rest move into the card sheet.

## What
1. **One state signal**, from: running, question, failed, needs you, waiting for a slot (C-398).
2. **PR number with its CI colour.**
3. **Small icons** for demo, design and dependencies, each with an accessible label and a tooltip.
4. **Kind** (feature or bug) stays as a colour or an icon.
5. **The rest moves into the card sheet:** cost, Saved, Steward, handoff, hooks and round pills. Nothing is lost.
6. Update the Board row of `docs/ui/screens.md`.

## Out of scope
- The card sheet's layout, beyond receiving the moved chips.

## Touched areas
- `apps/web/src/components/board/card-face.tsx`
- `apps/web/src/components/board/card-sheet.tsx`
- `docs/ui/screens.md`

## ADRs to read
- ADR-0011 (glass-ui components only; a missing component goes to glass-ui).
- No new ADR is needed.

## Acceptance criteria
- [ ] No tile shows more than four signals.
- [ ] Every chip removed from the face is reachable in the card sheet.
- [ ] Accessibility labels stay. A screen reader names the state, the PR and CI, and the icons.
- [ ] Screenshots in light, dark and phone width match the approved design.

## Tests
- Web: unit tests for which signal shows in each state, and that the removed chips render in the sheet.

## Open questions
- None.
