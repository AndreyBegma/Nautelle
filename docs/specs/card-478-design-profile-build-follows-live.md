# C-478: The UI profile section follows its build live instead of polling every 10 s

Stack **S-20**, stage 0.

## Summary
While a UI profile build runs, Settings › Design › UI profile refetches the profile every 10 s. A build takes minutes. The API already publishes the build run's status on the project topic, so the page can reload once, when the run ends.

## Scope
**In:** `apps/web/src/app/(app)/projects/[projectId]/settings/design/profile-section.tsx`.
**Out:** the API, which already publishes; the Connect dialog's runner poll (C-479).

## Current behaviour
- [Confirmed] `profile-section.tsx:44-45,99-105`: `BUILDING_POLL_MS = 10_000`; `setInterval(retry)` while `status === 'building'`.
- [Confirmed] `apps/api/src/design/learn/ui-profile-learner.ts:299-303`: `publishRun` sends `run.updated` (`{ id, status }`) on `project:<id>` when a build run settles.
- [Confirmed] The rebuild call answers `{ runId }` (`profile-section.tsx:110`).

## Decisions
- Follow `project:<projectId>` with `useLive`. On `run.updated` whose `id` is the build's run id, or on any `run.updated` while building if the run id is not known (after a reload), call `retry`.
- Keep one safety poll at 60 s while building, for a dropped socket. The live hook's reconnect also refetches, if it does so ([Unknown]; the card checks `apps/web/src/lib/live/use-live.ts`).

## Acceptance criteria
- [ ] A unit test of the handler: a `run.updated` for the build's run triggers one reload, and one for another run does not.
- [ ] While building, the page makes no request every 10 s. It reloads when the run settles.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-design-profile-build-live.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Settings › Design, starts Rebuild and shows the status change without a reload. If the runner in the demo cannot build, it shows the building state.

## Risks
- None worth naming.

## Open questions
- None.
