# C-480: Follow live events on Admin Schedules and Budgets instead of a 15 s poll

## Why
The cross-project admin pages poll every 15 s; schedule and budget events go only to project or user topics.

## What
- Publish the same events also on admin.
- Both pages follow admin (debounced), safety poll 60 s.

## Done when
- e2e: events reach both topics.
- A firing updates Admin › Schedules live.
- DemoFlow demo recorded.

Evidence: apps/web/src/app/admin/schedules/page.tsx:41,85,166; admin/budgets/page.tsx:60,86; apps/api/src/schedules/schedule-live.ts:41-60

Spec: docs/specs/card-480-admin-schedules-and-budgets-live.md
