# C-468: ⌘K lists the Inbox once, to /inbox, for the roles that have it

Stack **S-20 — Web: one place per thing, live instead of polling**, stage 0.

## Summary
The command palette shows two Inbox rows. One comes from the nav and opens `/inbox`. The other is hard-coded, opens the old `/work?status=inbox` filter, and is shown even to a viewer, who has no Inbox. This card removes the hard-coded row.

## Scope
**In:** `apps/web/src/components/shell/palette.ts` and its test.
**Out:** the nav itself; renaming the Board's capture column (C-471).

## Current behaviour
- [Confirmed] `palette.ts:73-74` keeps `INBOX_HREF = '/work?status=inbox'` with the comment "until it has a page of its own".
- [Confirmed] `palette.ts:243-245` puts `{ id: go:${INBOX_HREF}, label: 'Inbox' }` first whenever the query matches "inbox", with no role check.
- [Confirmed] The workspace pages already come from the nav sections (`palette.ts:230-242`, `sectionPages('workspace')`). The nav's Inbox entry opens `/inbox` and has `minRole: 'operator'` (`apps/web/src/components/shell/nav.ts:92-100`).
- [Confirmed] The real Inbox path is `INBOX_HREF = '/inbox'` in `apps/web/src/lib/inbox/format.ts:22`.

## Decisions
- One entry per page. The nav is where the palette gets it from (the person, 2026-10-26 interview: "one place per thing").
- `palette.ts`'s `INBOX_HREF` is deleted, not pointed at `/inbox`. The nav's entry already does the job and already checks the role.

## UI
No new layout. Typing "inbox" in ⌘K lists one **Inbox** row. An operator or admin sees it; a viewer does not.

## Acceptance criteria
- [ ] `palette.test.ts`: for an operator, the query "inbox" returns exactly one row, and its id is `go:/inbox`.
- [ ] `palette.test.ts`: for a viewer, the query "inbox" returns no Inbox row.
- [ ] Nothing in `apps/web/src` refers to `/work?status=inbox` any more (grep).
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-palette-inbox-entry.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens ⌘K, types "inbox", shows the one row and opens the Inbox.

## Risks
- None worth naming.

## Open questions
- None.
