# C-469: An action-request notification opens the Inbox, and its settings text covers tool calls

Stack **S-20**, stage 0.

## Summary
The `action.requested` notification still links to Queue › Approvals, but the Inbox is now where a person decides a request (ADR-0106). The rules table also describes the kind only by its orchestrator example. Most requests, however, are tool calls in away mode (ADR-0105).

## Scope
**In:** the notification link, how Telegram reads the link back, and the web example text.
**Out:** the Queue › Approvals tab (it stays); the Telegram buttons themselves.

## Current behaviour
- [Confirmed] `apps/api/src/local/action-request-mapper.ts:147-148`: `actionRequestLink` returns `/projects/:id/queue?tab=approvals&actionRequest=<id>`.
- [Confirmed] `action-request-mapper.ts:151-158`: the `LINK` regex reads the id back. It accepts the Queue form and the pre-C-284 `/approvals?` form. Telegram uses it (`apps/api/src/telegram/telegram-action-request.service.ts:75,177`), so a notification row's link is the only way back to its request.
- [Confirmed] The link is written at `apps/api/src/local/action-requests.service.ts:228` and `apps/api/src/telegram/telegram-assistant.service.ts:352`.
- [Confirmed] `apps/web/src/lib/notifications/format.ts:72`: the example for `action.requested` is "A session asks to start the orchestrator". At `:119` the kind is grouped under `fleet`.
- [Confirmed] The Inbox reads its `kind` filter from the URL (`apps/web/src/lib/inbox/format.ts:63-66`).

## Decisions
- The link becomes `/inbox?kind=permission&actionRequest=<id>` (the person, 2026-10-26 interview: one place per thing; ADR-0106).
- `LINK` accepts the new form **and** both old forms. Notification rows already stored keep working in Telegram.
- The Inbox ignores `actionRequest`; the `kind` filter is enough to find the row. Scrolling to the row is out of scope.
- The example text becomes "A session asks to run `npm test` (Bash)", a tool call. The group stays `fleet`.

## Acceptance criteria
- [ ] `action-request-mapper.spec.ts`: `actionRequestLink('p1','ar_1')` is `/inbox?kind=permission&actionRequest=ar_1`.
- [ ] `action-request-mapper.spec.ts`: `actionRequestIdOfLink` returns the id for the new form, the Queue form and the `/approvals?` form, and null for anything else.
- [ ] `apps/api/src/telegram/action-request-actions.spec.ts` still approves a request from a notification written with the new link.
- [ ] The bell's `action.requested` item opens the Inbox filtered to permissions.
- [ ] Account › Notifications shows the tool-call example for "Action requested".
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-action-request-opens-inbox.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens the bell, clicks an action request and lands on the Inbox.

## Risks
- A third-party consumer of the outbound webhook payload could rely on the old link. [Unknown] whether any does. The `/approvals` redirect still serves the old path.

## Open questions
- Should the Inbox highlight the named request? Default: no, the kind filter is enough.
