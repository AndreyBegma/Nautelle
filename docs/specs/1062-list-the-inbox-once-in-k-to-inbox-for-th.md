# C-468: List the Inbox once in ⌘K, to /inbox, for the roles that have it

Issue: #1062

## Why
⌘K shows two Inbox rows: the nav's, to /inbox, and a hard-coded one to the old /work?status=inbox filter, shown even to viewers who have no Inbox.

## What
- Delete the hard-coded row and palette.ts's INBOX_HREF; the nav entry (minRole operator) is the one row.

## Done when
- "inbox" in ⌘K gives one row to /inbox for an operator, none for a viewer (palette.test.ts).
- Nothing refers to /work?status=inbox.
- DemoFlow demo recorded.

Evidence: apps/web/src/components/shell/palette.ts:73-74,243-245; nav.ts:92-100

Spec: docs/specs/card-468-palette-inbox-entry-to-inbox.md
