# C-388: Live updates instead of polling on Work, Projects and Usage, and one fleet call for the Projects list

Stack **S-13 "Core 1 — Speed and reliability"**, stage *Speed* (with C-364 and C-389).
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.
The plan's order is speed → daily flow → fleet scale → team.

> A round of this card finished before the plan was paused, and it opened
> [PR #934](https://github.com/AndreyBegma/Nautelle/pull/934). Review that PR
> against this spec rather than starting the card again.

## Why
- The Board, Fleet, Queue, Project home, Settings and Sessions pages update live through `useLive`
  (`apps/web/src/lib/live/use-live.ts`).
- Other pages poll on a timer instead:
  - Work polls every 15 s (`apps/web/src/app/(app)/work/page.tsx:46`).
  - Projects polls every 15 s (`apps/web/src/app/(app)/projects/page.tsx:32`).
  - The project detail polls every 30 s.
- Usage never refreshes (`apps/web/src/app/(app)/usage/page.tsx`).
- The Projects list makes one fleet request per project. The only TODO in the source asks for a combined endpoint
  (`apps/web/src/app/(app)/projects/use-project-facts.ts:19`).

## Decisions (grilling session)
- The focus of the iteration includes speed and reliability, and that stage comes first.
- Nothing is removed in this iteration. Pages keep their place and layout.

## What
1. Move Work, Projects, the project detail and Usage to live events. Use the same `useLive` topics the Board uses,
   and add topics where they are missing.
2. Keep a slow fallback poll only while the socket is down. The reconnect banner (#353) already exists.
3. Add one API endpoint that returns the fleet facts of every project the user can see. Projects and Overview use it
   in place of the per-project calls.
4. No visible layout change.

## Out of scope
- Board load time (C-364).
- New pages or a different layout.

## Touched areas
- `apps/web/src/app/(app)/work/page.tsx`, `apps/web/src/app/(app)/projects/page.tsx`,
  `apps/web/src/app/(app)/projects/use-project-facts.ts`, `apps/web/src/app/(app)/usage/page.tsx`
- `apps/web/src/components/overview/use-dashboard.ts`, `apps/web/src/components/overview/projects-panel.tsx`
- `apps/web/src/lib/live/use-live.ts` and the API's live topics
- `apps/api/src/fleet/fleet.controller.ts`, `apps/api/src/fleet/fleet-workspace.service.ts` (the combined fleet read)

## ADRs to read
- ADR-0001 (control plane and per-machine runner). The API serves what runners report.
- No new ADR is needed.

## Acceptance criteria
- [ ] A card that moves on one project updates Work, Projects and Overview within a second, with no reload.
- [ ] The Projects page makes one fleet request, not one per project.
- [ ] Usage's "today" figure changes while a round runs.
- [ ] With the socket down, the pages fall back to a slow poll and the reconnect banner shows.

## Tests
- API: e2e test for the combined fleet endpoint, covering visibility per membership and the shape it returns.
- Web: the pages subscribe to the right topics, and the fallback poll starts only while the socket is down.

## Open questions
- None.
