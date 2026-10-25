# C-393: ⌘K with actions and card lookup, and keyboard navigation on the Board

Stack **S-14 "Core 2 — Daily flow"**, stage *Features*. It follows the stack's shared design.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- `apps/web/src/components/shell/palette.ts` only navigates, apart from theme, logout and Ask the Board.
- There is no C-12 lookup and there are no actions.
- The Board has ⌘A and Esc selection (`apps/web/src/components/board/board-view.tsx`), but no j/k navigation and no
  shortcut help.

## Decisions (grilling session)
- "Actions plus card lookup" in ⌘K.
- On the Board: j/k, Enter, r, and a `?` cheat sheet.

## What
1. **⌘K entries:**
   - **New card**, quick (C-391);
   - **New work**, through the interview;
   - **Find a card** by `C-12`, `#PR` or title, across projects;
   - for the found card: **Run**, **Accept**, **Stop**, **Open**;
   - **Go to Inbox** (C-390);
   - **Search settings** (C-395).
2. **Board keys:**

   | Key | Action |
   |---|---|
   | j/k or arrows | move between cards |
   | Enter | open the card |
   | r | run |
   | a | accept |
   | n | new card |
   | `?` | open the cheat sheet, which lists every shortcut |

3. Shortcuts never fire inside text inputs. They respect the role: an action the user cannot take is hidden.

## Out of scope
- Shortcuts on pages other than the Board.

## Touched areas
- `apps/web/src/components/shell/palette.ts`
- `apps/web/src/components/board/board-view.tsx`
- A card lookup endpoint, or reuse of the Board search (ADR-0069)

## ADRs to read
- ADR-0069 (Board search and triage hints).
- No new ADR is needed.

## Acceptance criteria
- [ ] Every action above works from the keyboard alone.
- [ ] `C-12` and `#PR` find the right card across projects.
- [ ] `?` lists every shortcut.
- [ ] No shortcut fires while typing in an input.

## Tests
- Web: palette entries per role, card lookup, Board key handling, the input guard.

## Open questions
- None.
