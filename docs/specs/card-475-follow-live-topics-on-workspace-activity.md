# C-475: Follow live topics on workspace Activity and Sessions instead of a 15 s poll

## Why
Activity polls every 15 s past 10 projects; unfiltered Sessions always polls because it follows no topic.

## What
- One shared planLive in lib/live; both pages follow up to 40 project topics (+ admin).
- Past that a 60 s poll with a muted line.

## Done when
- Unit test of the plan.
- Unfiltered Sessions makes no interval request and shows a new session live.
- DemoFlow demo recorded.

Evidence: apps/web/src/lib/activity/format.ts:19,355-369; apps/web/src/app/(app)/sessions/page.tsx:206-217

Spec: docs/specs/card-475-activity-and-sessions-follow-live.md
