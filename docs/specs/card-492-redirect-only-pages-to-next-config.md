# C-492: Move the redirect-only pages into next.config redirects

Stack **S-20**, stage 2: after C-486, which also edits `apps/web/src/lib/work/format.ts`.

## Summary
Six page files exist only to call `redirect()`. Each one renders a server component, ships a route and keeps a helper with its own tests. Next.js `redirects()` does the same before routing and keeps the query string. This card moves them into `apps/web/next.config.ts` and deletes the pages and the helpers that only served them.

## Scope
**In:** these pages:

| Old path | Redirects to |
|---|---|
| `/tasks` | `/work` |
| `/projects/:projectId/approvals` | `/projects/:projectId/queue?tab=approvals` |
| `/projects/:projectId/history` | `/projects/:projectId/activity?tab=runs` |
| `/projects/:projectId/history/:runId` | `/projects/:projectId/activity?tab=runs&run=:runId` |
| `/admin/settings` | `/admin/users` |
| `/admin` | `/admin/runners` |

**Out:** `/setup` and `/login`, whose redirects depend on state; any page that renders.

## Current behaviour
- [Confirmed] Redirect-only pages: `apps/web/src/app/(app)/tasks/page.tsx`, `(app)/projects/[projectId]/approvals/page.tsx`, `(app)/projects/[projectId]/history/page.tsx`, `(app)/projects/[projectId]/history/[runId]/page.tsx`, `admin/settings/page.tsx` and `admin/page.tsx`.
- [Confirmed] `tasksRedirectTarget` (`apps/web/src/lib/work/format.ts:191-215`) maps old plan statuses to `/work?source=plan&…`. After C-486, Work has no plan source.
- [Confirmed] `approvalsRedirectTarget` (`apps/web/src/lib/queue/tabs.ts:18-30`) copies the query and adds `tab=approvals`. `historyRedirectTarget` (`apps/web/src/lib/history/format.ts:177-189`) keeps the known run filters and adds `run`.
- [Confirmed] `apps/web/next.config.ts` has `rewrites` only.

## Decisions
- `permanent: false` (307) for all of them. A later rename can then still change a target without browsers caching the old one.
- Next appends the original query to the destination. `?actionRequest=` on an old approvals link therefore still arrives, and stored Telegram links keep their id (see C-469).
- `/tasks?status=…` is dropped to `/work` with its query passed through. Work's parser ignores unknown values. The plan-status mapping goes.
- Each helper is deleted, with its tests, unless something else imports it. `approvalsHref` and `runsHref` stay; they build links.

## Acceptance criteria
- [ ] A unit test reads the exported `redirects()` from `next.config.ts` and checks each row of the table above.
- [ ] `curl -I` against `next start` (or a Playwright step) shows a 307 from `/projects/p1/approvals?actionRequest=ar_1` to `/projects/p1/queue?tab=approvals&actionRequest=ar_1`.
- [ ] The six page files are gone, along with `tasksRedirectTarget`, `approvalsRedirectTarget` and `historyRedirectTarget` and their tests.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-old-urls-redirect.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then navigates to `/projects/demo-project/history` and lands on Activity › Runs.

## Risks
- `basePath` or i18n settings would change how redirects match. [Confirmed] neither is set in `next.config.ts`.

## Open questions
- None.
