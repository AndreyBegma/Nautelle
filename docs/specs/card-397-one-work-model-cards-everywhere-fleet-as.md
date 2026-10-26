# C-397: One work model: cards everywhere, Fleet as the live view of who works, Queue as incoming issues

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
The Board says "New work" and makes cards; Fleet and Queue say "New issue" and make GitHub issues for slots. Fleet cards are mirrored on the Board but refuse moves ("A fleet card follows its slot"). People cannot tell which system is in charge. The person chose the Board as the only model, without deleting pages.

## What
- One create action everywhere: a card (quick or interview).
- **Fleet** becomes the live view of what runs now: card workers, orchestrator slots and sessions, with their state and a link to the card.
- **Queue** becomes incoming work: open GitHub issues (labelled or all) with **Make a card**; the ready-issue queue for the orchestrator keeps working behind it.
- Cards mirrored from slots move like any card (moving one tells the slot or detaches it; decide in the ADR).
- Naming: "Work" is the cross-project list of cards; List/Board toggles stay inside a project.
- New ADR (next free number) recording the model.

## Done when
There is one create button, no refusal for moving a slot card, and Fleet/Queue headers say what they are for.

Spec: docs/specs/card-397-one-work-model-cards-everywhere-fleet-as.md (PR #937)
