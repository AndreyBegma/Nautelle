# C-457: Tell whether a PR head only merges the base into an earlier head

## Why
Merging the base into a PR gives a new head; review steps run again and the demo is recorded again, though the card's change did not move. The API cannot read git (ADR-0001).

## What
- New typed read `card.headDelta {from, to, base}`: true when `to` is a clean two-parent merge of `from` and a base commit (merge-tree result equals its tree).
- API service `BoardHeadCarry.isBaseMerge` asks once per pair and stores it in `card_head_carries` (migration 20261231000046).

## Done when
- Runner spec on a temp repo: clean base merge true; hand-resolved conflict, normal commit, non-base merge false.
- API asks once per pair; an older runner gives false and stores nothing.

Evidence: apps/api/src/board/board-review.ts:212-221, apps/api/src/board/board-shipping.ts:597-600

Spec: docs/specs/card-457-runner-tells-base-merge-only-heads.md
