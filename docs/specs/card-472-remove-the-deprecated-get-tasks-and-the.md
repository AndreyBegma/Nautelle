# C-472: Remove the deprecated GET /tasks and the unused POST /projects/:id/issues

## Why
GET /tasks was kept "for one release" after the Work List replaced it; POST /projects/:id/issues served the New issue dialog ADR-0098 §1 retired. Nothing calls either.

## What
- Delete both routes, TasksQueryService and the DTOs/types only they use.
- Keep MCP create_issue (local issue.create) and QueueService.createIssue (assistant).

## Done when
- Both routes are 404 in e2e.
- MCP create_issue and the assistant tool still pass.
- Docs no longer list them.

Evidence: apps/api/src/planner/planner-admin.controller.ts:30-48; apps/api/src/queue/queue.controller.ts:72-80

Spec: docs/specs/card-472-remove-get-tasks-and-post-issues.md
