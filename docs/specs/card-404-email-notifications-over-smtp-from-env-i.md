# C-404: Email notifications over SMTP from env, immediate or as a digest

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Notifications are in-app and Telegram only (`notification-writer.ts:118`).

## What
- `SMTP_URL` (and `SMTP_FROM`) in env, documented in `.env.example` and the docs site; a test-send button in Admin.
- Account › Notifications: email per event kind, immediately or as a daily digest of what waits on you and what was done.
- Used by the password-reset card for self-service reset.

## Done when
With SMTP set, a waiting question emails its owner, and the digest arrives once a day. Tests with a fake SMTP server.

Spec: docs/specs/card-404-email-notifications-over-smtp-from-env-i.md (PR #937)
