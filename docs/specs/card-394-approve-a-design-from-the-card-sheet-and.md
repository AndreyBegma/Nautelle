# C-394: Approve a design from the card sheet and the Inbox: preview, Approve and run, Back with comment

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
A design is approved only on the full-screen route
`apps/web/src/app/(app)/projects/[projectId]/board/cards/[number]/design/page.tsx`, so approving means leaving the Board.

## Decisions (grilling session)
- "Yes: a preview plus Approve and run," in the card sheet and in the Inbox.
- The full-screen viewer stays for detailed pin comments.

## What
1. In the card sheet, and in the Inbox item (C-390), a **preview** of the latest revision's frames: thumbnails per
   frame, click to zoom.
2. Three actions:
   - **Approve**;
   - **Approve and run**, which approves, then runs the card or queues it (C-398);
   - **Back with comment**, which starts a revise turn with that comment.
3. The same for a stack's design, on the stack sheet and in the Inbox.
4. Keep the full-screen viewer (`apps/web/src/components/design/design-viewer.tsx`) for pins and detailed work.

## Out of scope
- Changes to the design generation or the viewer itself.

## Touched areas
- `apps/web/src/components/board/card-sheet.tsx`
- `apps/web/src/components/design/` (a small preview component reusing frame rendering)
- The existing design approve and revise endpoints, including `apps/api/src/design/stack-design.controller.ts`

## ADRs to read
- ADR-0022 (design stage), ADR-0041 (named frames), ADR-0044 (stack design), ADR-0062 (a revise sends only the frames
  it changes), ADR-0082 (frame templates), ADR-0089 (a worker never approves a design).
- No new ADR is needed.

## Acceptance criteria
- [ ] A card with a waiting design can be approved and run without opening the full-screen viewer.
- [ ] Back with comment starts a revise turn with that comment.
- [ ] The same works for a stack's design.
- [ ] A viewer sees the preview but not the actions.

## Tests
- Web: preview rendering and the three actions.
- e2e: Approve and run on a card.

## Open questions
- None.
