# C-404: Email notifications over SMTP from env, immediate or as a digest

Stack **S-16 "Core 4 — Team"**, stage *Channels and tokens*, with C-403 and C-405. C-402 (account recovery) builds on it.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
Notifications go only to the web app and Telegram (`apps/api/src/notifications/notification-writer.ts`).
Self-service password reset (C-402) needs email.

## Decisions (grilling session)
- "SMTP from env, for notifications and for password reset."
- The audience of this iteration is the person plus the first external users. Cheap team features only.

## What
1. **Configuration.**
   - `SMTP_URL` and `SMTP_FROM` in env, documented in `apps/api/.env.example`, `deploy/compose/.env.example`, the Helm
     values and the docs site's configuration page.
   - Admin gets a **Send test email** button.
2. **Per-user choice.** In Account › Notifications (`apps/web/src/app/account/notifications/`), email per event kind,
   either immediately or as a daily digest.
3. **The digest** lists what waits on you and what was done that day.
4. **Without SMTP**, email options are hidden, and the reason is shown.

## Out of scope
- Inbound email, or replying to act.
- HTML templates beyond a simple, accessible layout.

## Touched areas
- `apps/api/src/notifications/notification-writer.ts`, `packages/shared/src/notifications/kinds.ts`
- A new mail sender module in `apps/api/src/`
- `apps/web/src/app/account/notifications/`
- `apps/api/.env.example`, `deploy/compose/.env.example`, `deploy/helm/nautelle/values.yaml`, the docs site

## ADRs to read
- ADR-0046 (Telegram command router), ADR-0096 (demo to Telegram as a notification).
- **A new ADR is needed**: email is a notification channel configured by env.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] With SMTP set, a waiting question emails its owner.
- [ ] The digest arrives once a day.
- [ ] Without SMTP, nothing breaks and the UI says why email is off.
- [ ] The test button reports success or the SMTP error.

## Tests
- API: e2e with a fake SMTP server, for immediate mail, the digest, and SMTP missing.

## Open questions
- None.
