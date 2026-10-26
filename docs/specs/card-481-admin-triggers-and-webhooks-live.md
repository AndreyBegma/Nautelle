# C-481: Admin Triggers and Webhooks follow the admin topic instead of polling

Stack **S-20**, stage 0.

## Summary
The Triggers and Webhooks lists, and the sheet behind each row, poll every 15 s. The sheets also listen on `admin` for new deliveries. The API already publishes `webhook.delivery_updated` and the inbound-delivery event on `admin`, so the polls are redundant.

## Scope
**In:**
- `apps/web/src/app/admin/integrations/triggers/page.tsx` and `trigger-sheet.tsx`;
- `apps/web/src/app/admin/integrations/webhooks/page.tsx` and `webhook-sheet.tsx`.

**Out:** the API; Slack.

## Current behaviour
- [Confirmed] `triggers/page.tsx:42,87`, `trigger-sheet.tsx:42,93`, `webhooks/page.tsx:41,73` and `webhook-sheet.tsx:48,120` each set `POLL_MS = 15_000`.
- [Confirmed] `webhook-sheet.tsx:124-126` and `trigger-sheet.tsx:97` already `useLive('admin')` and reload on a delivery event.
- [Confirmed] `apps/api/src/webhooks/outbound/webhook-live.ts:28` publishes `WEBHOOK_LIVE_EVENTS.deliveryUpdated` on `admin`. `apps/api/src/webhooks/inbound/inbound-live.ts:28-31` publishes `inboundDeliveryCreated` on `admin` with `triggerId`.

## Decisions
- The lists follow `admin` too. Triggers reloads on `inboundDeliveryCreated`; Webhooks reloads on `deliveryUpdated`. Both are debounced to one per second.
- The intervals go from all four files. A sheet already reloads on reconnect through `useLive` [Unknown: the card checks `apps/web/src/lib/live/use-live.ts`]. If it does not, a single 60 s safety poll stays.
- Web only, so no API change.

## Acceptance criteria
- [ ] No 15 s interval is left in the four files (grep `POLL_MS`).
- [ ] An inbound delivery to a trigger updates its row's last delivery on the Triggers list live. An outbound delivery updates the Webhooks list.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-admin-triggers-webhooks-live.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Admin › Integrations › Webhooks, sends a test delivery and shows the row update live.

## Risks
- None worth naming.

## Open questions
- None.
