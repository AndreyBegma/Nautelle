# C-462: Pass a head that only merges the base on its parent head's review

Stack **S-19 "Review steps and demo videos"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
After every review step passed on a card's head, merging the base into the PR gives a new head, and the gate runs
every step again — a full session per step for a change the card did not make. This card lets the gate pass such a
head on the passed head's review, using C-457's answer.

## Current behaviour
- [Confirmed] The gate reads runs by `(cardId, headSha, pass)` and starts every step without one (`apps/api/src/board/board-review.ts:212-221`).
- [Confirmed] The strip shows `passed` only when the newest run's head is the card's `ciHeadSha` (`apps/api/src/board/board-mapper.ts:563-566`); the facts read every run of the PR (`apps/api/src/board/board-review-facts.ts:40-60`).

## Decisions
- ADR-0120 §6 (written by C-459). Source: the 2026-10-26 improvement plan (candidate 5); spec 884 Open questions.
- Before starting any step on `headSha`, the gate finds the newest head `prev` of the same PR and `pass` on which **every enabled step passed** (no run blocked or failed). When `BoardHeadCarry.isBaseMerge(project, card, prev, headSha)` is true, the gate answers `pass` and starts nothing. Otherwise it runs as today.
- It is transitive by construction: a second base merge is compared with `prev`, the head the steps ran on, not with the first merge head. The gate keeps `prev` as the reviewed head by recording the carry it used (`card_head_carries`, from C-457).
- A blocked or failed `prev` is not carried: the findings stand, and the fix round makes a new head.
- An audit entry `card.review_carried` `{ number, pr, from, to }` records it.
- The strip treats `ciHeadSha` as reviewed when a `card_head_carries` row with `baseMerge` true leads from the newest run's head to it; the facts read those rows for the cards they read.

## Acceptance criteria
- [ ] Every step passed on head A; the PR moves to B, a clean base merge of A: no `card.review` is sent, the gate answers `pass`, the card goes to Finished (`apps/api/src/board/board-review.e2e.spec.ts`).
- [ ] B is not a base merge (`card.headDelta` false): every step runs on B (same spec).
- [ ] A step was blocked on A: B runs every step (same spec).
- [ ] A runner without `card.headDelta`: every step runs on B (same spec).
- [ ] The card face shows review `passed` for B (`apps/api/src/board/board-mapper.spec.ts` or the e2e).

## Risks
- A clean merge can still break the card's change semantically (the base renamed what it uses). CI still runs on B and a red B starts a fix round as today; the review is the only check skipped.

## Open questions
- Should a project be able to turn the carry off? Default: no setting; it is always on with review.
