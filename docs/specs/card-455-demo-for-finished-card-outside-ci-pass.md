# C-455: Record the demo of a Finished card's new green head outside the CI pass

Stack **S-19 "Review steps and demo videos"**, stage 0. Part of the 2026-10-26 improvement plan. Kind: bug.

## Summary
A Finished card that the CI pass no longer reads — auto-merge off or a protected path, with checks already green — is
only watched for a merge. When a new head lands on its PR (a person pushes, or GitHub's "Update branch") and its
checks go green, that head never gets a demo, and an older demo stays the card's. This card records it.

## Current behaviour
- [Confirmed] The CI pass reads only cards with `needsPerson: false` that are In progress, pending, or Finished with checks `none`/`red`, or waiting for a demo (`apps/api/src/board/board-shipping.ts:183-224`).
- [Confirmed] Every other Finished card is in the merge watch (`board-shipping.ts:226-236`), which reads the PR only for a merge or a close; "Its checks are not stored: they would move the card into the CI pass" (`board-shipping.ts:381-387`, `417-453`). It never calls `demos.supersede` or `recordDemo`.
- [Confirmed] The CI pass records a demo for a Finished green card only when it is not `needsPerson` (`board-shipping.ts:629-640`).

## Decisions
- The merge watch, on an open or draft PR whose head differs from the card's `ciHeadSha`, supersedes a demo of an older head (`demos.supersede`) and, when that head's checks read green (`cardCiStateOf`), calls `recordDemo` for it — the same call the CI pass makes (`board-shipping.ts:703-718`). Source: ADR-0095 §1 and ADR-0099 §1 (a Finished card's green head is recorded), the 2026-10-26 improvement plan (candidate 9).
- The checks are still not stored, so the card does not enter the CI pass and is never merged by this path (ADR-0100).
- A `needsPerson` card is left out, as ADR-0095 §1 says ("a card that needs a person … get[s] none"); ADR-0095 §1 also says a Finished card not merged automatically "is still recorded once its head reads green", which this card makes true for a later head.
- Nothing changes for a head equal to `ciHeadSha`: that head was read by the CI pass already.

## Acceptance criteria
- [ ] A Finished card with auto-merge off whose PR moves to a new green head gets one `auto` demo of that head, and its demo of the old head in flight is superseded (`apps/api/src/board/board-merge-watch-demo.e2e.spec.ts`, new) — the test that would have caught this.
- [ ] A `needsPerson` Finished card gets none (same spec).
- [ ] The card's `ciState`, `ciHeadSha` and column do not change, and no merge is attempted (same spec).
- [ ] A new head with checks pending or red gets no demo from the merge watch (same spec).

## Risks
- The merge watch reads a card at most every `CARD_FINISHED_PR_POLL_MS`, so the demo of such a head starts up to that much later than in the CI pass. Acceptable.

## Open questions
- None.
