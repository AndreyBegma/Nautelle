# C-388: Live updates instead of polling on Work, Projects and Usage, and one fleet call for the Projects list

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Board, Fleet, Queue, Project home, Settings and Sessions update live through `useLive`, but Work and Projects poll every 15 s (`apps/web/src/app/(app)/work/page.tsx:46`, `projects/page.tsx:32`), the project detail every 30 s, and Usage never refreshes. The Projects list makes one fleet request per project (`use-project-facts.ts:19` TODO).

## What
- Move Work, Projects, the project detail and Usage to live events (the same `useLive` topics the Board uses; add topics where missing). Keep a slow fallback poll only when the socket is down (reconnect banner #353 already exists).
- One API endpoint that returns the fleet facts of every project the user can see, used by Projects and Overview, replacing the per-project calls.
- No visible layout change.

## Done when
A card moving on one project updates Work, Projects and Overview within a second without reload, the Projects page makes one fleet request, and Usage's "today" figure moves while a round runs. Tests for the new endpoint and the live topics.
