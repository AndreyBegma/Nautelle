# C-509: Add the task card kind: an assignee, a checklist and Done that satisfies dependants

## Why
Some work is not code ("add the secret", "approve the DNS change") and blocks code cards, but every card today is a code card (`BoardCardKind` is feature | bug).

## What
- Card kind `task`: no session, runner, PR or demo; an assignee (a project member), an optional checklist, Done and Reopen.
- Done = the accept path into Completed, so dependants become Ready and Auto-run when ready fires; readiness itself is unchanged.
- The assignee (even a viewer) may Done / tick their own task.
- Run, feedback, collect, design, assess, review, demo, take/track refuse a task; Run stack never queues one.
- Migration 20261231000053, ADR-0127.

## Done when
- A code card that depends on a task starts by itself after the assignee presses Done (e2e).
- Every runner path on a task returns 409 card_is_task.
- Authorization e2e: assignee viewer allowed, other viewer 403, non-member 404.

Evidence: apps/api/prisma/schema.prisma:3290, packages/shared/src/board/dependencies.ts:61, apps/api/src/board/board-work.ts:578

Spec: docs/specs/card-509-task-card-kind-assignee-checklist-done.md
