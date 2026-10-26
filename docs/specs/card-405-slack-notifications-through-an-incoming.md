# C-405: Slack notifications through an incoming webhook

Stack **S-16 "Core 4 — Team"**, stage *Channels and tokens*.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
Teams live in Slack, and Telegram is the only chat channel (`apps/api/src/telegram/telegram-delivery.service.ts`).

## Decisions (grilling session)
- "An incoming webhook, with links." No OAuth app and no interactive buttons.

## What
1. **Webhook URL.** A Slack incoming webhook URL, per project in Settings or workspace-wide in Admin.
   It is stored encrypted, with the app's secret cipher.
2. **Events.** The same events as Telegram:
   - a card finished, with its demo;
   - a question;
   - a failure;
   - a budget alert;
   - a merge.
3. **Format.** Each message carries links that open Nautelle.
4. **Controls.** Per-event toggles, and a **Send test message** button.

## Out of scope
- A Slack app with OAuth, slash commands or interactive Merge and Approve.

## Touched areas
- `apps/api/src/notifications/notification-writer.ts`, `packages/shared/src/notifications/kinds.ts`
- A new Slack sender module in `apps/api/src/`
- Project settings, and the Admin integrations page

## ADRs to read
- ADR-0096 (the demo goes out as a notification), ADR-0046.
- No new ADR is needed if the email ADR (C-404) defines notification channels in general. Otherwise add one with the
  next free number at implementation time.

## Acceptance criteria
- [x] A finished card posts to the configured channel with its PR and demo link.
- [x] The per-event toggles are respected.
- [x] A bad URL is reported by the test button and does not block other channels.

Implemented with ADR-0109; every criterion is checked by `apps/api/src/slack/slack.e2e.spec.ts`.

## Tests
- API: e2e with a fake webhook endpoint, for each event kind, the toggles and the error path.

## Open questions
- None.
