# C-491: The Telegram bot answers /inbox: what waits on me

Stack **S-20**, stage 1: after C-470, which changes `inbox.service.ts`.

## Summary
In the web app the Inbox answers "what waits on me" across projects (ADR-0106). In Telegram a person has to go through `/board` project by project. This card adds `/inbox`, which reads the same server read model.

## Scope
**In:** a new bot command, its handler, `/help` and the command menu.
**Out:** deciding items from the list (the buttons on each notification already do that), and the Mini App.

## Current behaviour
- [Confirmed] `apps/api/src/telegram/telegram-commands.ts:10-21`: `BOT_COMMANDS` holds project, board, card, new, newchat, help and stop. There is no inbox command.
- [Confirmed] `InboxService.view(user)` (`apps/api/src/inbox/inbox.service.ts:58-83`) answers `InboxView` with items, counts and the missing projects.

## Decisions
- `/inbox` lists the counts per kind on one line ("2 to merge · 1 question · 3 permissions"), then the 10 oldest items, one line each: project, item title, age. Then comes a link button **Open Inbox** to `APP_URL/inbox`, when `APP_URL` is https (as the Mini App button does).
- Items are rendered as fixed text from their fields, escaped. Nothing from a session's output is echoed: a question item shows "C-12 asks a question", not the question text, the same rule as notifications (`kinds.ts`: "they name the card only").
- The chat's linked user is the reader. An unlinked chat gets the existing "link this chat first" answer.
- With nothing waiting, the answer is "Nothing waits on you."

## Acceptance criteria
- [ ] `telegram-commands.spec.ts`: `/inbox` is in `BOT_COMMANDS` and `HELP_TEXT`.
- [ ] Telegram e2e: a linked operator with 12 items gets the counts, 10 lines and the button. Another user's items never appear (authorization).
- [ ] A question item's line does not contain the question's text.
- [ ] No web UI, so no DemoFlow demo; the PR shows a screenshot of the bot's answer from the fake Telegram client log.

## Risks
- None worth naming.

## Open questions
- None.
