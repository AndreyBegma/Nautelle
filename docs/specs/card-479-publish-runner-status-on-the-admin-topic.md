# C-479: Publish runner status on the admin topic and follow it on runner pages and Connect

## Why
Admin › Runners, the runner sheet and the Connect dialog poll every 10 s because nothing publishes a runner's status.

## What
- runner.updated {runnerId, status} on the admin topic on connect, disconnect, rename, revoke and pairing.
- The three surfaces refetch on it (debounced); safety poll 60 s.

## Done when
- e2e: each change publishes once.
- Connect dialog sees a runner come online within a second.
- DemoFlow demo recorded.

Evidence: apps/web/src/app/admin/runners/page.tsx:40,289; runner-sheet.tsx:44,96; connect-dialog.tsx:48,313

Spec: docs/specs/card-479-runners-follow-the-admin-topic.md
