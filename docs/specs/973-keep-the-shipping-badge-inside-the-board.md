# C-378: Keep the shipping badge inside the Board card

Issue: #973

Status: superseded by C-392 (#940). Nothing is left to do.

## What happened

The issue reported that a long shipping badge, such as "Protected paths changed; a person merges" (`PROTECTED_PATHS_TEXT` in `apps/web/src/lib/board/shipping.ts`), overflowed the right edge of a Board card.

C-392 (#940) replaced the Board card's multi-badge status row with a single `StatusPill` fed by `faceState()` (`apps/web/src/components/board/card-face.tsx`). The card face now shows only short labels, and the full text lives in the pill's tooltip through `faceState().title`. The long shipping text is no longer rendered on the face, so the overflow described in the issue cannot occur.

## Outcome

- No code change is made for this card.
- The wording in `shipping.ts` is untouched; the card sheet still renders it.
- The issue is closed as fixed by C-392.
