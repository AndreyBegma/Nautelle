# C-482: Old notifications and their deliveries are pruned, like activity items

Stack **S-20**, stage 0.

## Summary
Nothing ever deletes a row from `notifications`, `notification_deliveries` or `slack_deliveries`. Every runner blip, card event and budget alert stays forever, for every recipient. The feed has had a retention job from the start (spec 21 D6). This card adds the same for notifications.

## Scope
**In:** a nightly retention job in `apps/api/src/notifications/`, a new environment variable and its docs.
**Out:** `notification_rules`, mutes, the Telegram link, the email settings and the matcher state; audit records, which are never deleted.

## Current behaviour
- [Confirmed] `apps/api/src/activity/activity-retention.job.ts:13-50` deletes `activity_items` older than `ACTIVITY_RETENTION_DAYS` daily at 04:30 through `SchedulerRegistry`.
- [Confirmed] No `deleteMany` on `notification`, `notificationDelivery` or `slackDelivery` exists in `apps/api/src` (grep). The only notification delete is of mutes (`notification-rules.service.ts:241`).
- [Confirmed] Models: `Notification` (`schema.prisma:1573-1607`), with `@@index([userId, lastAt, id])`; `NotificationDelivery` (`:1673-1692`), which cascades from its notification; `SlackDelivery` (`:2360-2378`), with `@@index([webhookId, createdAt])`.
- [Confirmed] `Notification` has `@@unique([eventId, userId, kind])`. Deleting old rows lets a replayed **old** event notify again. Events older than the retention are not replayed in practice: ingest is by sequence, and the matcher keeps its cursor (`NotificationMatcherState`).

## Configuration
`NOTIFICATION_RETENTION_DAYS`, default `90`, minimum `7`. It goes in `apps/api/.env.example` next to `ACTIVITY_RETENTION_DAYS` and in `apps/docs/src/content/docs/configuration/environment.md`.

## Decisions
- Delete notifications whose `lastAt` is older than the retention, **read or not**. An unread notification three months old helps nobody, and the bell shows the last 20 anyway.
- `notification_deliveries` go with their notification (cascade). Slack deliveries whose `createdAt` is older than the retention are deleted, unless the row is `pending` and due. A queued message is never dropped.
- Delete in batches of 5 000 ids per statement until none are left, so one sweep never locks the table for long. The job runs at 04:45 as `notification-retention` on `SchedulerRegistry`, so it shows up in Admin › Schedules' system jobs (spec 25 Q3).
- No new index and no migration. A batch selects ids by `lastAt` with a `LIMIT`, and a nightly scan is acceptable at self-hosted sizes. The PR posts the `EXPLAIN` of one batch.

## Acceptance criteria
- [ ] `notification-retention.e2e.spec.ts`: rows older than the retention are deleted with their deliveries. Newer ones stay. A pending, due Slack row stays whatever its age.
- [ ] A sweep over 12 000 old rows deletes them in at least 3 batches. A spy on `$executeRaw` or `deleteMany` checks it.
- [ ] `NOTIFICATION_RETENTION_DAYS=3` fails config validation at boot, with a message.
- [ ] The job is listed in Admin › Schedules' system jobs. No other UI, so no demo.

## Risks
- Admins with a long-standing habit of reading old bell items lose them after 90 days. The default is generous, and the variable changes it.

## Open questions
- An index on `notifications(lastAt)` if the `EXPLAIN` shows a costly scan? Default: no; a follow-up card with its own migration number.
