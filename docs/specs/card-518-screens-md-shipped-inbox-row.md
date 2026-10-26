# C-518: screens.md describes the shipped Inbox row, settings search and Work sources

Stack **S-21 "Docs match the product"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
`docs/ui/screens.md` still describes two C-393 stopgaps as current and its Work row misses a source. The palette
code itself is fixed by C-468 ("List the Inbox once in ⌘K"); this card only makes the screen doc say what ships,
after C-468 merged.

## Scope
**In:** `docs/ui/screens.md`.
**Out:** `apps/web/src/components/shell/palette.ts` and its test (owned by C-468), the Inbox page, the Work list.

## Current state
- [Confirmed] `docs/ui/screens.md:74-79` says the Inbox row points at `/work?status=inbox` "until the Inbox page
  lands (C-390)" and that settings search is a stopgap belonging to C-395. C-395 shipped: the palette lists settings
  blocks through `searchSettings` (`apps/web/src/components/shell/palette.ts:38`, `:119-133`).
- [Confirmed] `docs/ui/screens.md:147` (Work) lists "board cards, plan tasks and — for operators — Inbox
  suggestions". The row is missing the **Fleet** source (`apps/web/src/lib/work/format.ts:46-51`, #388). Whether plan
  tasks stay in Work depends on C-486 ("Work lists cards only"): describe what develop shows when this card runs.

## Decisions
- One writer per file: the palette fix belongs to C-468; this card is documentation only (the orchestrator,
  2026-10-26, deduplicating the plan).

## What
1. Replace `screens.md` :74-79 with the shipped behaviour: the Inbox row opens `/inbox`; typing a setting lists the
   matching settings blocks (C-395).
2. In the Work row name the sources Work shows on develop at the time (Card · Suggested · Fleet, plus Plan if C-486
   has not merged).

## Acceptance criteria
- [ ] `screens.md` has no "stopgap" or "until … lands" sentence about the Inbox or settings search.
- [ ] The Work row lists exactly the sources `apps/web/src/lib/work/format.ts` defines on the branch.
- [ ] `bun run check` passes. No UI change, so no demo.

Depends on C-468.
