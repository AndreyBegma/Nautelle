# C-480: Admin Schedules and Budgets follow live events instead of polling every 15 s

Stack **S-20**, stage 0.

## Summary
Admin › Schedules and Admin › Budgets poll every 15 s. The API already publishes every schedule change and every budget update, but only on `project:<id>` (and `user:<id>` for personal budgets). These cross-project admin pages would have to subscribe to every project to hear them. This card also publishes the same events on `admin`, and the two pages follow that topic.

## Scope
**In:**
- `apps/api/src/schedules/schedule-live.ts`;
- the budget publish in `apps/api/src/budgets/budget-evaluator.ts`;
- `apps/web/src/app/admin/schedules/page.tsx` and `apps/web/src/app/admin/budgets/page.tsx`.

**Out:** the project-level schedule and budget pages, which already follow their project.

## Current behaviour
- [Confirmed] `apps/web/src/app/admin/schedules/page.tsx:41,85,166`: `POLL_MS = 15_000`, two intervals.
- [Confirmed] `apps/web/src/app/admin/budgets/page.tsx:60,86`: `POLL_MS = 15_000`.
- [Confirmed] `schedule-live.ts:41-60` publishes `schedule.updated`, `schedule_firing.updated`, `schedule.fired` and the other schedule events on `project:<id>`.
- [Confirmed] `budget-evaluator.ts:311-320` publishes `budget.updated` on `project:<id>` or `user:<id>`.

## Decisions
- Publish each event a second time on `admin`, with the same type and data. The admin pages already read every project, so the topic reveals nothing new to an admin.
- The pages follow `admin` and reload their list on the events listed above (debounced to one per second). Each keeps a 60 s safety poll.
- A system schedule (no project, `apps/web/src/app/admin/schedules/page.tsx` "system jobs") stays on its poll. It has no events.

## Acceptance criteria
- [ ] `schedules.e2e.spec.ts`: a firing publishes its events on both `project:<id>` and `admin`.
- [ ] `budgets` e2e: a budget update publishes on its scope topic and on `admin`.
- [ ] Neither admin page has a 15 s interval left. A schedule fired from the project page updates Admin › Schedules without a reload.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-admin-schedules-budgets-live.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Admin › Schedules, runs a schedule now and shows its row update live.

## Risks
- Double publishing costs one extra send per event to the admins' sockets. That is negligible.

## Open questions
- None.
