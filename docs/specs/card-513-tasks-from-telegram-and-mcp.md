# C-513: Tasks from Telegram and MCP — a quick task to yourself or to a member

Stack **S-24 "Tasks for a person"**, stage 3. It needs C-509 and C-512 (the `task.assigned` kind), and must land after C-511, which also edits `apps/runner/src/mcp/tools.ts`.

## Summary
A task should take one line to make, wherever the person is. This card adds three ways:
- `/task` in Telegram;
- `kind: 'task'` on the MCP `card_create` tool and on the Telegram assistant's card tool;
- a **Done** button on the Telegram `task.assigned` message.

## Scope
**In:** the Telegram command and its member picker, the Done button, the MCP `card_create` arguments, and the assistant tool arguments.
**Out:** a separate `task_done` MCP tool. Done stays a person's click; a person's session can still use `card_move` to `completed`, under its existing rules.

## Decisions
- D1 — Tasks also come from Telegram and from MCP: a quick task to yourself or to a member. *The person, 2026-10-26 interview (Q16 c).*
- D2 — Telegram: `/task <title>` creates a task in the chat's project, assigned to the sender, and answers with the card, an **Assign to…** button and **Done**. **Assign to…** lists the project's members as inline buttons, eight per page, by display name (users have only `email` and `name`, no handle: `apps/api/prisma/schema.prisma:22-28` [Confirmed]). The command is added to `BOT_COMMANDS` (`apps/api/src/telegram/telegram-commands.ts:10-21` [Confirmed]) and `HELP_TEXT`. It needs operator on the chat's project, like card creation (`apps/api/src/board/board.controller.ts:223-224` [Confirmed]). *This spec.*
- D3 — The `task.assigned` Telegram message gets a **Done** button, and an **Open** button through `withOpenInApp`. Its callback goes through `callbackCodec` (`apps/api/src/telegram/callback-data.ts:100` [Confirmed]) and acts under C-509 D5: the assignee, or operator+. *This spec.*
- D4 — MCP: `card_create` (`apps/runner/src/mcp/tools.ts:302-323` [Confirmed]) accepts `kind: 'task'`, `assignee?: string` and `checklist?: string[]`. `assignee` is `"me"` (the default) or a member's email. `LOCAL_CARD_KINDS` (`packages/shared/src/protocol/local.ts:411` [Confirmed]) stays the code kinds. The args schema gets `kind: z.enum([...LOCAL_CARD_KINDS, 'task'])`, and `assignee` and `checklist` are refused on a code card. A runner that is older than this card simply does not offer `task`. *This spec.*
- D5 — The Telegram AI assistant's card-creating tool (`apps/api/src/assistant/tools/board-tools.ts`) takes the same `kind`, `assignee` and `checklist`, so "ask Anna to add the Stripe key" becomes a task for Anna. The name is matched against the project's members by email or display name. An ambiguous or unknown name is answered with the candidates, and no task is created. *This spec; ADR-0060.*

## API
No new routes. Everything goes through `BoardTasks.create` (C-509) with the caller as actor, so the C-512 notification fires.
- `apps/api/src/local/local-board-handlers.ts:76` (`card.create` [Confirmed]) passes the new args.
- The Telegram handlers go in a new `apps/api/src/telegram/telegram-task.service.ts`.

## Acceptance criteria
- [ ] `/task Add the STRIPE_KEY secret` in a linked chat creates a task assigned to the sender in the chat's project. **Assign to…** → Anna reassigns it, and Anna gets `task.assigned` (e2e `telegram-task.e2e.spec.ts`).
- [ ] **Done** on the Telegram message completes the task. A chat of a user who is neither the assignee nor an operator gets "Not allowed", and nothing changes.
- [ ] `/task` from a viewer, or in a chat with no project chosen, is refused with the bot's usual text.
- [ ] MCP `card_create {kind:'task', title, assignee:'me', checklist:[…]}` from a person's session creates the task. An unknown email gets `assignee_not_member`, and `assignee` on a code card gets `task_field` (e2e in `local-requests.e2e.spec.ts`).
- [ ] The assistant turns "remind Anna to rotate the token" into a task for Anna. An ambiguous "Andrey" lists the matches and creates nothing (e2e in `telegram-assistant.e2e.spec.ts`).
- [ ] `/help` lists `/task`.

## Open questions
- `/task @name …` inline? Default: no; the picker covers it without a handle field on users.
