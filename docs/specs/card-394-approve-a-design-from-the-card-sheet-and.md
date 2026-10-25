# C-394: Approve a design from the card sheet and the Inbox: preview, Approve and run, Back with comment

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
A design is approved only on the full-screen route `board/cards/[n]/design`, so approving means leaving the Board.

## What
In the card sheet (and the Inbox item): a preview of the latest revision's frames (thumbnails, click to zoom), **Approve**, **Approve and run**, **Back with comment** (starts a revise turn). The full-screen viewer stays for detailed pin comments. Same for a stack's design.

## Done when
A card with a waiting design can be approved and run without opening the full-screen viewer.

Spec: docs/specs/card-394-approve-a-design-from-the-card-sheet-and.md (PR #937)
