# C-482: Prune old notifications and deliveries nightly

## Why
notifications, notification_deliveries and slack_deliveries are never deleted; the feed has had a retention job from the start.

## What
- NOTIFICATION_RETENTION_DAYS (default 90, min 7).
- A nightly job on SchedulerRegistry deletes older notifications (deliveries cascade) and old Slack deliveries except due pending ones, in batches.

## Done when
- e2e: old rows go, new stay, due Slack rows stay; batches checked.
- Variable documented; job listed in system jobs.

Evidence: apps/api/src/activity/activity-retention.job.ts; apps/api/prisma/schema.prisma:1573,1673,2360

Spec: docs/specs/card-482-prune-old-notifications-and-deliveries.md
