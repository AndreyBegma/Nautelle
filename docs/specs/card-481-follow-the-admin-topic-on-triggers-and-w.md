# C-481: Follow the admin topic on Triggers and Webhooks instead of polling

## Why
Triggers and Webhooks lists and sheets poll every 15 s although the API already publishes deliveries on admin.

## What
- Lists follow admin and reload on delivery events; drop the four intervals (web only).

## Done when
- No POLL_MS left in the four files.
- A delivery updates its row live.
- DemoFlow demo recorded.

Evidence: apps/web/src/app/admin/integrations/webhooks/webhook-sheet.tsx:48,120-126; apps/api/src/webhooks/inbound/inbound-live.ts:28-31

Spec: docs/specs/card-481-admin-triggers-and-webhooks-live.md
