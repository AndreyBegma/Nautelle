# C-443: Show a terminal card's tracked session filters on its sheet

## Why
A card counts its tracked session's saving, but the sheet lists filters per round only, so a terminal card shows a saving with no breakdown (#767). The API already computes it per session.

## What
- Card view `trackedSessionFilters`, from `tokenSaverFiltersBySession`.
- A Tracked session block with the existing `FilterBreakdown`.

## Done when
- Board e2e incl. an authorization test across projects; sheet test; DemoFlow demo.

Evidence: #767; packages/shared/src/board/contracts.ts:543; apps/api/src/token-saver/token-saver-facts.ts:446-501.

Spec: docs/specs/card-443-tracked-session-filters-on-card.md
