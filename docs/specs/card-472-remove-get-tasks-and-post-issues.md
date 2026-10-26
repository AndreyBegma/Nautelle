# C-472: Remove the deprecated GET /tasks and the unused POST /projects/:id/issues

Stack **S-20**, stage 0.

## Summary
Two HTTP endpoints have no caller left. `GET /tasks` was kept "for one release" after the Work List replaced it. `POST /projects/:id/issues` was the web New issue dialog's route, and ADR-0098 §1 retired that dialog. This card removes both, with their DTOs and tests. The services behind them stay where something else uses them.

## Scope
**In:** `TasksController` and `TasksQueryService`; the `createIssue` route; the DTOs and shared types only these routes use; their e2e cases.
**Out:** the MCP `create_issue` tool and the runner's `issue.create` (ADR-0098 §1 keeps them); `QueueService.createIssue`, which the assistant uses.

## Current behaviour
- [Confirmed] `apps/api/src/planner/planner-admin.controller.ts:30-48`: `@deprecated` `TasksController` (`GET /tasks`): "a follow-up removes it". It is registered at `planner.module.ts:46`.
- [Confirmed] No web or runner code calls `/tasks`. The only hits are comments and the `/tasks` page redirect (`apps/web/src/app/(app)/tasks/page.tsx`, handled by C-492).
- [Confirmed] `apps/api/src/work/work.e2e.spec.ts:9` imports `TASK_PAGE_SIZE` from `tasks-query.service`.
- [Confirmed] `apps/api/src/queue/queue.controller.ts:72-80`: `POST issues` → `queue.createIssue`. No web code posts to it (grep for `/issues` in `apps/web/src`).
- [Confirmed] MCP `create_issue` (`apps/runner/src/mcp/tools.ts:177-190`) calls the local method `issue.create`. It is handled by `apps/api/src/local/local-handlers.ts:158`, not by the HTTP route.
- [Confirmed] `apps/api/src/assistant/tools/board-tools.ts:389` calls `this.queue.createIssue` directly. The service method stays.

## API
Removed:
- `GET /tasks`, which now answers 404.
- `POST /projects/:projectId/issues`, which now answers 404.

## Decisions
- Remove both, without a deprecation period. Removing dead endpoints is allowed (the person, 2026-10-26 interview), and nothing in the repository calls them.
- `CreateIssueDto` and the shared `CreateIssueResult` go only if nothing else imports them. The assistant tool's input is checked separately.

## Acceptance criteria
- [ ] `GET /tasks` and `POST /projects/:id/issues` are 404 in an e2e (`work.e2e.spec.ts` and `queue.e2e.spec.ts` respectively).
- [ ] The MCP `create_issue` e2e (`apps/api/src/local/local-requests.e2e.spec.ts` or the board e2e that stubs `issue.create`) still passes.
- [ ] The assistant's create-issue tool still works (its spec passes).
- [ ] `tasks-query.service.ts` is deleted if nothing imports it after the change. `TASK_PAGE_SIZE` moves to where `work.e2e.spec.ts` still needs it, or the test stops needing it.
- [ ] `docs/` no longer documents either endpoint. `bun run check` passes. No UI, so no demo.

## Risks
- A person's own script calling `GET /tasks` with a personal API token breaks. The release note names the removal (release is later).

## Open questions
- None.
