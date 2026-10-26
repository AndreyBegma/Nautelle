# C-470: Bound the Inbox read: requests capped per project, readiness read in one batch

Stack **S-20**, stage 0.

## Summary
`GET /inbox` runs on every shell load and on every live event (ADR-0106). It reads the setup readiness of each busy project one by one. It also caps pending requests across all projects together, not per project as ADR-0106 says. With many projects this is a fan-out on every event, and one noisy project can push out every other project's requests.

## Scope
**In:** `apps/api/src/inbox/inbox.service.ts`, and a batch read in `apps/api/src/readiness/readiness.service.ts`.
**Out:** the Inbox contract (`InboxView` is unchanged) and the web.

## Current behaviour
- [Confirmed] `inbox.service.ts:30`: `REQUESTS_PER_PROJECT = 50`. At `:222-230` a single `findMany` uses `take: REQUESTS_PER_PROJECT * projects.length`, ordered by `createdAt` ascending. One project with 500 old requests fills the whole page.
- [Confirmed] `inbox.service.ts:259-287`: `setupItems` calls `this.readiness.view(project.id)` once per busy project in `Promise.allSettled`.
- [Confirmed] `readiness.service.ts:38-74`: each `view` runs a `project.findUnique`, `resolver.resolve(project)` and a `runtimeProfile.findMany` for the project's runner.
- [Unknown] how many queries `RuntimeProfileResolver.resolve` runs per call.
- [Confirmed] ADR-0106 Consequences: "bounded by open cards and by 50 pending requests per project."

## Decisions
- **Per-project cap, in one query.** Requests are read with one `$queryRaw` that ranks rows per project (`ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at)`) and keeps `≤ 50` per project. The rows then map through `toActionRequestSummary` as today. (ADR-0106 Consequences.)
- **Readiness in one batch.** `ReadinessService.viewMany(projectIds)` reads the projects in one `findMany` and the runtime profiles of their runners in one `findMany`. It answers a `Map<projectId, ProjectReadinessView | Error>`. `view(id)` becomes `viewMany([id])`, so the two cannot drift.
- **No cache.** A cached readiness would show a fixed blocker as still blocking. The batch removes the fan-out without making the data stale.
- A project whose readiness fails is still `missing`, as before (`inbox.service.ts:268-279`).

## Acceptance criteria
- [ ] `apps/api/src/inbox/inbox.e2e.spec.ts`: project A has 60 pending requests and project B has 1. The Inbox lists 50 of A's and B's 1.
- [ ] `apps/api/src/inbox/inbox.e2e.spec.ts`: a non-member never sees another project's requests (authorization test of the new query).
- [ ] `apps/api/src/readiness/readiness.e2e.spec.ts`: `viewMany` with 10 projects on 2 runners runs one project query and one profile query. Its views equal those of `view` for each id.
- [ ] One project failing readiness still yields `missing` for it and the items of the others.
- [ ] `bun run check` passes. No web change, so no demo.

## Risks
- Requests are capped before `mayDecideActionRequest` filters them (`inbox.service.ts:232-240`). A project with 50 requests the caller may not decide hides newer ones the caller may. This is the same limit as today, now per project.

## Open questions
- Should `resolver.resolve` be batched too? Default: only if the spec test shows it querying per project. Then batch it in the same card.
