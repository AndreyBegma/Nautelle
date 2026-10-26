# C-507: The analysis report and its proposed cards in the card sheet

Stack **S-23 "Analysis cards"**, stage 2. Needs C-503 (view) and C-506 (routes). **needsDesign.**

## Summary
An analysis card's sheet shows its report and a quiet list of proposed cards with checkboxes; the person ticks
some and presses **Create selected**. The sheet hides what an analysis card never has (PR, CI, Review, demo).
A card created from an analysis says where it came from.

## Scope
**In:** a new `apps/web/src/components/board/card-analysis-section.tsx`, its placement in
`apps/web/src/components/board/card-sheet.tsx`, the tab list in `card-tabs.tsx`, the face in `card-face.tsx`,
actions in `apps/web/src/lib/board/actions.ts`.
**Out:** entry points (C-508).

## Decisions
- D1. A list with checkboxes and **Create selected**; To Do by default, Inbox as an option — *the person,
  2026-10-26 interview (Q11)*.
- D2. "It must look clean, not loaded" — *the person, 2026-10-26 interview*. So: one column, no tables, no
  per-row buttons, metadata in muted text, bodies collapsed.
- D3. glass-ui only (ADR-0011): `SectionHeader`, `Checkbox`, `Chip`, `Disclosure`, `Select`, `Button`,
  `Banner` — all already used in the board components ([Confirmed]
  `apps/web/src/components/board/candidate-group.tsx:3-6`, `card-sheet.tsx:3-15`). `KindChip` is reused from
  `split-review.tsx` ([Confirmed] `split-review.tsx:424`) and taught `task`.

## UI
Overview tab of an analysis card, top to bottom:
1. **Report** — `SectionHeader`, the markdown rendered; longer than about 12 lines it is cut with a
   `Disclosure` "Show the full report".
2. **Proposed cards (n)** — `SectionHeader` with a text action "Select all / none". One row per proposal:
   `Checkbox` · title · `KindChip` (only for bug and task; feature is the default and shows nothing) · in muted
   text after the title: up to 3 labels as small chips (`+2` beyond) and "after #1" for dependencies. Clicking
   the title opens the body in a `Disclosure` under the row. Nothing ticked by default.
3. A footer bar, shown once a box is ticked: `Select` "To Do | Inbox" and the primary **Create selected (k)**.
   Without a selection, a plain text button **Complete without cards** sits at the end of the list
   (confirms first).
4. After create: rows of created proposals show "C-412" as a link instead of a checkbox; dismissed ones are
   struck through and muted; a `Banner` lists dropped dependencies, if any. The sheet header shows Completed.

While the round runs: the usual running state; no Report section until it finishes. A round that ended without
`finish_analysis` shows the usual failed state.

Tabs for an analysis card: Overview, Rounds, Files, Edit — no Review ([Confirmed] tabs at
`card-tabs.tsx:6-25`). The PR, CI, demo and review sections are not rendered.

Card face of an analysis card: a lens icon (lucide `Telescope`) for the kind and, in Finished, "5 proposals"
in the face's meta line; no PR/CI chips.

A card with `origin`: a muted line "From analysis C-400" (link) under the sheet title.

## Acceptance criteria
- [ ] `card-analysis-section.test.tsx`: renders the report, the rows, the counter on the button, Select all,
      the Inbox choice in the request, created rows as links and dropped dependencies in a banner.
- [ ] `card-sheet.test.tsx`: an analysis card has no Review tab and no PR, CI or demo section; a card with
      `origin` shows the link.
- [ ] `card-face.test.tsx`: analysis icon and proposal count; no PR/CI chips.
- [ ] Only glass-ui components; no new primitive written in `apps/web` (a missing one goes to glass-ui).
- [ ] Works at phone width (the sheet is full screen below `lg`), keyboard: space toggles a row, the button is
      reachable by Tab.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-analysis-report-and-proposals.demo.json` signs in through
      `demoflow/fragments/sign-in.json` in `setup`, opens a seeded finished analysis card, ticks two
      proposals, chooses To Do, presses Create selected, and shows the two new cards and the analysis card in
      Completed.

## Risks
- `card-sheet.tsx` is 1 714 lines; the new section lives in its own file and the sheet only branches on
  `kind === 'analysis'`.

## Open questions
- Ticked by default? Default: none ticked (the person "ticks").
