# C-499: Show labels as a colour stripe on the card face, chips in the sheet, and a Board label filter

## Why
Labels only help if the Board shows them — without bringing back the chip clutter C-392 removed from the face.

## What
- A thin stripe on the card's left edge: up to three label colours as segments, no names, hidden from screen readers while the header names the labels.
- The card sheet: labels as coloured chips with an "auto" marker; an operator edits them with a multi-select, and that choice is the person's truth.
- The Board toolbar: a Label filter in the URL.
- Live recolour when Settings change.

## Done when
- 0, 2 and 4 labels render as none, two and three segments; the filter works and survives a reload.
- A removed auto label does not come back.
- Light, dark and phone screenshots match the design; DemoFlow demo recorded.

Evidence: apps/web/src/components/board/card-face.tsx:73-159; apps/web/src/components/board/board-toolbar.tsx:22-85

Spec: docs/specs/card-499-label-stripe-sheet-chips-and-board-filter.md
