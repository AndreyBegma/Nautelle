# C-512: A task waits in its assignee's Inbox and notifies them

Stack **S-24 "Tasks for a person"**, stage 2. It needs C-509 and the web client from C-510.

## Summary
A task assigned to someone has to reach them. This card adds a `task` Inbox item for the assignee. It also adds the notification kind `task.assigned`, which goes out in-app, on Telegram, by email and on Slack according to the person's settings.

## Scope
**In:** the shared Inbox contract, `InboxService`, the Inbox row with **Done**, the notification kind, and the Slack event.
**Out:** the Done button on the Telegram message and the Telegram `/task` command (C-513).

## Decisions
- D1 — A task shows in its assignee's Inbox and notifies them, in-app, on Telegram, by email or on Slack, according to their settings. *The person, 2026-10-26 interview (Q12).*
- D2 — The Inbox lists only projects where the caller is operator or higher (`apps/api/src/inbox/inbox.service.ts:86-115` [Confirmed]). Task items get their own query: open tasks (To Do or In progress) where `assigneeId` is the caller, across every project the caller can see (`ProjectAccessService.visibleWhere`). A viewer who is assigned a task sees it too. Nobody sees someone else's tasks in their Inbox. *ADR-0106 (one server read), this spec.*
- D3 — The item kind `task` is added to `INBOX_ITEM_KINDS` (`packages/shared/src/inbox/contracts.ts:27-34` [Confirmed]) as `InboxTaskItem { card, checklist: {done,total}, raisedFor }`. `since` is when the card was assigned. A task in the Inbox column (a proposal) raises no item. *This spec.*
- D4 — The notification kind `task.assigned` has scope `account` and goes only to the assignee. This is the scope `telegram.link_pending` already uses (`packages/shared/src/notifications/kinds.ts:85`, `:278-284` [Confirmed]). Channels: in-app and Telegram, both on by default. Email defaults to `immediate`. It fires on create and on every reassign, never to the person who assigned it to themselves. Its text gives the title, the project, who assigned it, and the code card it unblocks, if any. *This spec.*
- D5 — The project's Slack webhook posts it as a new Slack event `task` ("A task was assigned", naming the assignee's display name), on by default, next to the events in `packages/shared/src/notifications/slack.ts:9-16` [Confirmed]. *This spec; ADR-0109.*

## API
- `apps/api/src/board/board-tasks.ts` (from C-509): emit `task.assigned` through `NotificationWriter` inside the assign transaction, from create, PATCH `assigneeId`, Accept of a candidate task, and C-511's raise.
- `apps/api/src/inbox/inbox.service.ts`: `taskItems(user)`, merged into `sortInboxItems`, and counted in `inboxCounts` and the rail badge.

## UI
- `apps/web/src/components/inbox/inbox-row.tsx` / `inbox-items.tsx`: a `task` row shows the task face text from C-510 `tasks.ts`, the project, the checklist count, "Unblocks C-41" when there are dependants, **Open**, and **Done** (with the same unticked-items confirmation). Only glass-ui components.
- The notification settings table lists `task.assigned` from the shared specs; no extra code is expected.

## Acceptance criteria
- [ ] Assigning a task to user B puts a `task` item in B's `GET /inbox`, and B gets an in-app notification and, if linked, a Telegram message.
- [ ] Authorization (e2e `inbox.e2e.spec.ts`): user C on the same project does not see B's task item, and a user not on the project gets nothing. A viewer B sees their own task.
- [ ] Assigning a task to yourself sends no notification; reassigning it to D notifies D.
- [ ] With email `immediate`, an email goes out; with Slack on, the webhook gets a `task` post (fake endpoint in `slack.e2e.spec.ts`).
- [ ] Done from the Inbox row completes the task, and the item disappears live.
- [ ] The DemoFlow demo `demoflow/cards/C-<n>-task-in-the-inbox.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It assigns a task, opens the Inbox, ticks the task done there, and shows the dependent card Ready.

## Open questions
- Should the person who raised or created a task get a notification on Done? Default: no new kind. The dependant starting is already visible, and `card.finished` follows.
