# C-478: Follow the UI profile build live instead of a 10 s poll

## Why
While a UI profile builds, Settings › Design refetches every 10 s; the API already publishes run.updated when the build settles.

## What
- Follow project:<id> and reload on the build run's run.updated; keep a 60 s safety poll.

## Done when
- No 10 s requests while building; one reload when it settles.
- DemoFlow demo recorded.

Evidence: apps/web/src/app/(app)/projects/[projectId]/settings/design/profile-section.tsx:44-45,99-105; apps/api/src/design/learn/ui-profile-learner.ts:299-303

Spec: docs/specs/card-478-design-profile-build-follows-live.md
