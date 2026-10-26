# C-465: Keep a card's demo when its new head only merges the base

Stack **S-19 "Review steps and demo videos"**, stage 3. Part of the 2026-10-26 improvement plan.

## Summary
Merging the base into a card's PR gives a new head. Today that supersedes a demo still recording, marks a ready demo
"outdated", and records the whole demo again, though the card's change did not move. This card keeps the demo for a
head that only merges the base, using C-457's answer.

## Current behaviour
- [Confirmed] Every new open head supersedes a demo in flight of another head (`apps/api/src/board/board-shipping.ts:597-600`, `apps/api/src/demos/card-demos.service.ts:428-446`).
- [Confirmed] A head with no `card_demos` row of its own gets a new automatic demo (`card-demos.service.ts:346-349`, `361-382`).
- [Confirmed] A demo is `outdated` when its `headSha` differs from the PR head (`card-demos.service.ts:88-89`), and Telegram skips an outdated demo (`apps/api/src/demos/demo-outdated.ts:10-25`).

## Decisions
- ADR-0121 §2 (written by C-458). Source: the 2026-10-26 improvement plan (candidate 5); ADR-0099 Consequences.
- Before `supersede`, the shipping flow asks `BoardHeadCarry.isBaseMerge(project, card, demo.headSha, newHead)` for the card's newest demo that is not `skipped` (queued, recording, ready or failed). When true, that demo is not superseded and the new head records nothing: `autoRecord` treats a head reached by a stored base-merge carry from a demo's head as recorded.
- `outdated` (the demo view, which the sheet's "This demo is outdated" banner reads — `apps/web/src/components/demos/demo-section.tsx:46-47` — and `demoOutdated`) is false when a `card_head_carries` row with `baseMerge` true leads from the demo's head to the PR head. Carries chain: A → B → C keeps A's demo.
- A failed demo is carried as failed: the new head would fail the same way. "Record again" still records the current head.
- Nothing is stored on `card_demos`; the carry rows of C-457 are the record.

## Acceptance criteria
- [ ] A demo of A is recording; the PR moves to B, a clean base merge of A: the demo is not superseded, finishes `ready`, is not `outdated`, and B gets no new demo (`apps/api/src/board/board-demos.e2e.spec.ts`).
- [ ] A ready demo of A; the PR moves to B (base merge) then C (base merge of B): no new demo, not outdated, Telegram sends it (same spec).
- [ ] B is not a base merge: today's behaviour — superseded, new demo of B (same spec).
- [ ] A runner without `card.headDelta`: today's behaviour (same spec).

## Risks
- A clean base merge can change what a page looks like (the base restyled it). The video then shows the card's change on the older base, which is what the card did. "Record again" is the person's way to see the merged state.

## Open questions
- None.
