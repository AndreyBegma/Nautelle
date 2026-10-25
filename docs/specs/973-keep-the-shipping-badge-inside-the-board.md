# C-378: Keep the shipping badge inside the Board card

Issue: #973

## What to do
On a Board card, the shipping status badge overflows the card's right edge when its text is long. Example: C-366 with the badge "Protected paths changed; a person merges" (`PROTECTED_PATHS_TEXT` in `apps/web/src/lib/board/shipping.ts`). The pill extends past the card's padding and border.

Cause: in `apps/web/src/components/board/card-face.tsx` (the `badge ? (...)` branch, around line 283) the non-review badge is a `<Badge>` inside a bare `<span>` with no `min-w-0` / `max-w-full`, so it cannot shrink below its nowrap content. The review chip right above it already handles this: `min-w-0 max-w-full` plus an inner `truncate` span, with the full text in the `Tooltip`.

Make the shipping badge stay within the card width: it truncates with an ellipsis on one line and the full text stays available in the existing tooltip. Do it with the glass-ui component or its props (ADR-0011); if glass-ui's `Badge` cannot truncate, use the same `Chip` pattern the review chip uses or add the capability to glass-ui. Check the other badges in the same status row (`Dialog open`, `Didn’t start`, the not-pushed badge, `Finish refused`) for the same overflow and fix them the same way if they have it.

## Acceptance criteria
- [ ] A card with the badge "Protected paths changed; a person merges" no longer extends past the card's right edge at the narrowest Board column width; the badge ends with an ellipsis when it does not fit.
- [ ] The full badge text is still readable through the tooltip.
- [ ] Short badges (e.g. "PR #903 · Open", CI dot, cost) look and lay out exactly as before.
- [ ] A render test in `apps/web/src/components/board/card-face.test.tsx` covers the long shipping badge (the badge element carries the shrink/truncate classes), next to the existing "a narrow card keeps the label whole" test.
- [ ] `bun run check` passes.

## Out of scope
- Changing the badge wording in `shipping.ts` or the tone/colour logic.
- Redesigning the card layout or the status row.
- Changes to the card sheet or review section.

## Open questions
None.
