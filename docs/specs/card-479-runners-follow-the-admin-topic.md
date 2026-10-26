# C-479: Runner pages and the Connect dialog follow runner status on the admin topic

Stack **S-20**, stage 0.

## Summary
Admin › Runners, the runner sheet and the Connect project dialog each poll the runner list every 10 s, so that a runner coming online shows up. The API knows the moment a runner connects or disconnects, but it publishes nothing about it. This card publishes a small `runner.updated` event on the existing `admin` topic, and the three surfaces follow it.

## Scope
**In:**
- the API publish, at runner connect, disconnect, rename, revoke and pairing;
- the event's shared type;
- `apps/web/src/app/admin/runners/page.tsx` and `runner-sheet.tsx`;
- `apps/web/src/app/(app)/projects/connect-dialog.tsx`.

**Out:** schedules, budgets, triggers and webhooks (C-480, C-481); the runner protocol.

## Current behaviour
- [Confirmed] `apps/web/src/app/admin/runners/page.tsx:40,289`, `runner-sheet.tsx:44,96` and `connect-dialog.tsx:48,313` each use `setInterval(load, 10_000)`.
- [Confirmed] The `admin` topic is registered, admin-only (`apps/api/src/live/topic-authorizer.registry.ts:29,40`). Today it carries project-less activity items and webhook deliveries (`apps/api/src/activity/activity-projector.service.ts:347-349`, `apps/api/src/webhooks/outbound/webhook-live.ts:28`).
- [Confirmed] A connect is handled in `apps/api/src/runners/runner.gateway.ts:282-302` (`connectHooks.connected`) and a disconnect at `:336-342`. Rename and revoke are in `apps/api/src/runners/runners.service.ts:178,223`.
- [Confirmed] Connect is an admin action (ADR-0107 §1 for the move; Connect is admin too), so its dialog's viewer may follow `admin`.

## API
`RUNNER_UPDATED_LIVE_EVENT = 'runner.updated'` in `packages/shared/src/runners/` (or the domain file holding the runner contracts): `{ runnerId: string; status: RunnerStatus }`, on `admin`. It is published after the state change is committed, best effort (a publish failure is logged, like `webhook-live.ts`).

## Decisions
- Reuse `admin`; no new topic (ADR-0010 is unaffected, since this is API → web).
- The event says only which runner changed and its status. The pages refetch their list, so there is still one source of truth.
- Each page keeps a 60 s safety poll for a dropped socket. That is down from 10 s.

## Acceptance criteria
- [ ] `runners.e2e.spec.ts` or `runner-gateway.e2e.spec.ts`: a runner connecting, disconnecting, being renamed or revoked publishes one `runner.updated` on `admin` with its id and status.
- [ ] A non-admin cannot subscribe to `admin`. The existing authorizer test still passes.
- [ ] With the Connect dialog open, a runner coming online is selectable within a second, without the 10 s poll.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-runners-follow-admin-topic.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Admin › Runners and shows a status change live. If the demo runner cannot be toggled, it opens the Connect dialog with its runner list.

## Risks
- A flapping runner publishes often, and each publish triggers a refetch. The pages debounce refetches to one per second.

## Open questions
- None.
