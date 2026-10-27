# C-471: Name the Board's capture column "Suggestions", not "Inbox"

## Why
"Inbox" names two things: the Board column of captured suggestions and the cross-project page of what waits on you (C-390).

## What
- Every user-facing string for the column says Suggestions: column title, Work status label, refusals, the cards.suggested notification body, the summary source, docs.
- The enum id inbox, routes and MCP arguments stay; no migration.

## Done when
- The Board and Work show Suggestions.
- Grep finds 'Inbox' only on the Inbox page's own code.
- Docs renamed.
- DemoFlow demo recorded.

Evidence: packages/shared/src/board/card-rules.ts:134; apps/web/src/lib/work/format.ts:59; apps/api/src/notifications/event-mapping.ts:426

Spec: docs/specs/card-471-rename-board-capture-column-suggestions.md
