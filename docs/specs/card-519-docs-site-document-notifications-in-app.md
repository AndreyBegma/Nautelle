# C-519: Docs site: document notifications — in-app, Telegram, email and Slack

## Why
Notifications go out on four channels, but the docs site only lists SMTP_URL, SMTP_FROM and the Telegram variables in the environment table. Nobody can learn from it what is notified, who sets up which channel, or how per-kind rules and mutes work.

## What
- One page under Using Nautelle: the kinds, the in-app bell and Inbox, Telegram, email (SMTP_URL/SMTP_FROM), Slack incoming webhooks (project vs workspace, per-event toggles), per-kind rules and mutes.
- Links the environment page instead of repeating it.

## Done when
- Docs build passes; prerequisites match ADR-0108/0109; the kind list matches NOTIFICATION_KIND_SPECS. No demo.

Evidence: ADR-0108, ADR-0109; apps/docs/src/content/docs/configuration/environment.md:45-51

Spec: docs/specs/card-519-docs-site-notifications.md
