# C-471: Name the Board's capture column "Suggestions", not "Inbox"

Stack **S-20**, stage 0.

## Summary
Two different things are called "Inbox". One is the Board column where suggestions captured from sessions wait. The other is the cross-project page of what waits on the person (C-390, ADR-0106). This card renames the Board column "Suggestions" everywhere a person reads it. The stored column id stays `inbox`.

## Scope
**In:** user-facing strings in shared, api and web; the docs site; product docs.
**Out:** the `BoardColumn` enum value `inbox`, the API routes, the MCP tool arguments and the `/inbox` page. No migration.

## Current behaviour
- [Confirmed] `packages/shared/src/board/card-rules.ts:134`: `COLUMN_TITLE.inbox = 'Inbox'`. At `:98`, "A suggestion leaves the Inbox only by Accept, into To Do."
- [Confirmed] `apps/web/src/lib/work/format.ts:59`: `WORK_STATUS_LABEL.inbox = 'Inbox'`. At `:49`, the source label is already "Suggested".
- [Confirmed] `apps/api/src/summaries/summary-sources.ts:67`: `inbox: 'Inbox'` is fed to the model.
- [Confirmed] `apps/api/src/board/board-inbox.service.ts:18`: "The card is not in the Inbox". `apps/api/src/board/board-work.ts:290` has a refusal message.
- [Confirmed] `apps/api/src/notifications/event-mapping.ts:426`: the `cards.suggested` body says "review it in the Inbox".
- [Confirmed] `packages/shared/src/board/capture-limits.ts:32` comments `inbox_full` as "the Inbox holds…". [Unknown] whether a user-facing message for it says "Inbox". The card greps for it.
- [Confirmed] `apps/docs/src/content/docs/concepts/board.md:15` lists the column as **Inbox**. `docs/product/roadmap.md` mentions it too.

## Decisions
- The label is **Suggestions**; one card in it is "a suggestion" (the person, 2026-10-26 interview: one name per concept).
- The enum id `inbox` stays. Renaming it would need a migration and would break the MCP `board_list`/`card_move` arguments and stored URLs (`?column=inbox`), for no gain a person can see.
- Code comments that say "the Inbox" for the column are renamed where the card already edits the file. Comments elsewhere are left alone.

## UI
The Board column header, its empty-state hint (`apps/web/src/lib/board/format.ts:85` is already right), the Work status chip and filter, refusals and toasts all say "Suggestions". The `/inbox` page keeps its name.

## Acceptance criteria
- [ ] The Board shows a **Suggestions** column. A Work row of a captured card reads "Suggestions".
- [ ] The `cards.suggested` notification body says "review it in Suggestions on the Board".
- [ ] `grep -rn "'Inbox'" packages/shared/src apps/api/src apps/web/src` finds only the Inbox page's own strings: `nav.ts`, `lib/inbox`, `components/inbox`, `app/(app)/inbox` and `apps/api/src/inbox`.
- [ ] `concepts/board.md` and `docs/product/roadmap.md` name the column Suggestions.
- [ ] Updated unit tests pass (`card-rules`, `work/format`, the event-mapping spec).
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-board-suggestions-column.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the Board's Suggestions column and the Work filter.

## Risks
- An agent prompt or skill text that says "Inbox column" now disagrees with the UI. The card greps `plugins/` and the prompt files and renames what a person or model reads.

## Open questions
- None.
