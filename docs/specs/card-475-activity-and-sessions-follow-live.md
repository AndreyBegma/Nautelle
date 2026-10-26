# C-475: Workspace Activity and Sessions follow live topics instead of polling every 15 s

Stack **S-20**, stage 0.

## Summary
Workspace Activity follows the project topics only when a person has at most 10 projects; past that it polls every 15 s. Workspace Sessions without a project filter always polls, because it subscribes to nothing. This card gives both one live plan. They follow up to the socket's budget of project topics, plus `admin` for an admin, and poll only past that budget, where the poll is slower.

## Scope
**In:** `planLive` (`apps/web/src/lib/activity/format.ts`), the Activity feed, the Sessions page and `liveTopicFor` (`apps/web/src/lib/sessions/format.ts`).
**Out:** new server topics, and the project-level pages, which already follow `project:<id>`.

## Current behaviour
- [Confirmed] `apps/web/src/lib/activity/format.ts:19`: `LIVE_PROJECT_BUDGET = 10`. At `:355-369`, past the budget `planLive` returns `{ topics: [], poll: true }`.
- [Confirmed] `apps/web/src/app/(app)/activity/feed.tsx:194-197`: `setInterval(loadFirst, POLL_MS)` while `plan.poll`.
- [Confirmed] `apps/web/src/lib/sessions/format.ts:136-142`: `liveTopicFor` gives `null` without a project, unless "unassigned" is set.
- [Confirmed] `apps/web/src/app/(app)/sessions/page.tsx:206-217` polls every `POLL_MS` whenever there is no topic.
- [Confirmed] `packages/shared/src/live/topics.ts:8`: `MAX_LIVE_SUBSCRIPTIONS = 50` per socket.

## Decisions
- `planLive` moves to `apps/web/src/lib/live/plan.ts`, and both pages use it. Sessions follows `sessions.changed`, Activity follows `activity.item`.
- The budget becomes `MAX_LIVE_SUBSCRIPTIONS − 10` (40). The 10 left over are for the shell's own topics and one open page. The shell's subscriptions are [Unknown] in number; the card counts them and sets the reserve so that shell + page ≤ 50.
- Past the budget the pages still poll, at 60 s instead of 15 s, and say so in a muted line ("Following updates every minute: too many projects to follow live."). A per-user fan-out topic would need a server decision (see Open questions).

## UI
No new layout. Past the budget, one glass-ui muted text line appears above the list.

## Acceptance criteria
- [ ] `lib/live/plan.test.ts`: 3 projects for an admin give 3 `project:` topics plus `admin`, with no poll. 41 projects give a poll and no topics. A fixed project gives that one topic.
- [ ] Sessions with no filter, for a member of 2 projects, subscribes to both topics and makes no interval request. A Playwright check or the demo's network log shows it.
- [ ] A new session on a followed project appears on Sessions without a reload.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-activity-and-sessions-live.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Sessions and Activity, and a new item appears live.

## Risks
- More subscriptions per socket. They stay under the server's cap by construction.

## Open questions
- Should the API add a per-user `workspace` hint topic, so that past the budget is live too? Default: no; that is its own card with an ADR. A self-hosted team with more than 40 projects is rare.
