# C-495: A failed schedule firing notifies its creator

Stack **S-20**, stage 3: after C-493, which also adds a kind to the shared kind list and the format maps.

## Summary
A schedule that fails tells nobody until it has failed often enough to be disabled. Only then does `schedule.disabled` reach the admins. A nightly review that broke on Monday is noticed on Thursday. Spec 25's default was "notify only on auto-disable". This card changes it: the creator hears about each failed firing, folded per schedule.

## Scope
**In:** a new kind `schedule.failed`, mapped from the `schedule.failed` event the API already records.
**Out:** `schedule.skipped` (expected, not a fault); notifying admins of every failure.

## Current behaviour
- [Confirmed] `apps/api/src/schedules/schedule-events.ts:15-25` records a `schedule.failed` event with source `api` for a failed firing (D17, spec 25).
- [Confirmed] `apps/api/src/notifications/event-mapping.ts:255-275` maps only `SCHEDULE_DISABLED_LIVE_EVENT` → `schedule.disabled`, `adminsOnly`, and only when `event.source === API_EVENT_SOURCE`.
- [Confirmed] `docs/specs/25-cron-schedules.md:187`: "Notify the creator on every failed firing? — No — only on auto-disable".
- [Unknown] whether the `schedule.failed` event's data carries the creator's id. The card reads `ScheduleEventData` and adds `createdById` if it is missing.

## Decisions
- Kind `schedule.failed`, scope `account` (to the schedule's creator only). Channels are in-app and Telegram; defaults are in-app on and Telegram off. This reverses spec 25's default (the person, 2026-10-26 interview, candidate list).
- The event is trusted only with source `api`, as for `schedule.disabled`.
- Fold per schedule over 24 h, so a schedule failing every 5 minutes is one notification with a count.
- Title "Schedule "<name>" failed"; body: the firing's failure reason code in words, never stack text; link to the schedule's row.
- A creator who left the project gets nothing; the schedule is disabled by D10 anyway.

## Acceptance criteria
- [ ] `event-mapping.spec.ts`: an API `schedule.failed` event maps to `schedule.failed`. A runner-sourced one maps to null.
- [ ] `schedules.e2e.spec.ts`: a failed firing writes one notification to the creator and none to other members (authorization). Three failures in a day fold into `count: 3`.
- [ ] Account › Notifications lists "Schedule failed". The web and email `Record<NotificationKind>` maps have the kind.
- [ ] `docs/specs/25-cron-schedules.md`'s open-question row is updated to point to this card.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-failed-schedule-notifies.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the bell item for a seeded failed firing and opens the schedule.

## Risks
- None worth naming.

## Open questions
- None.
