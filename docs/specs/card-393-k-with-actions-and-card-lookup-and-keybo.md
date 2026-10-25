# C-393: ⌘K with actions and card lookup, and keyboard navigation on the Board

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
`shell/palette.ts` only navigates (plus theme, logout, Ask the Board). There is no C-12 lookup and no actions; the Board has no j/k navigation and no shortcut help.

## What
- ⌘K: New card (quick), New work (interview), find a card by `C-12`, `#PR` or title across projects, and for the found card Run / Accept / Stop / Open; go to Inbox; search settings (settings card).
- Board: j/k (or arrows) to move between cards, Enter to open, r to run, a to accept, n for a new card, `?` for a cheat sheet listing every shortcut.

## Done when
Every action above works from the keyboard alone; `?` lists them.

Spec: docs/specs/card-393-k-with-actions-and-card-lookup-and-keybo.md (PR #937)
