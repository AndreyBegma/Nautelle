# C-500: Suggest labels for a new card with the cheapest model

## Why
The person wants labels set automatically from the moment a card exists, not only after it has a pull request.

## What
- After a card is created without labels, ask the cheapest enabled model (the Quick card path, feature `card_labels`) which of the project's labels fit the title and body — at most two.
- Fire-and-forget: create never waits; no model, a timeout or a bad answer leaves the card unlabelled.
- Written as `model` labels through `BoardLabels.applyAuto`, so a person's labels are never touched.

## Done when
- e2e: a fake provider's answer labels the card live; unknown names, no model, timeout and the switch off all leave it unlabelled; a create with labels makes no call; a person's edit before the answer wins.

Evidence: apps/api/src/board-ai/board-quick-draft.service.ts:36-79

Spec: docs/specs/card-500-suggest-labels-for-a-new-card-with-a-model.md
