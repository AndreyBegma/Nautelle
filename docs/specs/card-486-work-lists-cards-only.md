# C-486: Work lists cards only, not plan tasks

Stack **S-20**, stage 1: after C-471, which changes the Work labels, and C-472, which changes `work.e2e.spec.ts`.

## Summary
ADR-0098 §5 names **Work** "the cross-project list of cards". Yet `GET /work` still merges a second source, the tasks of every readable plan. It has its own status mapping, its own `rejected` status and its own row shape. This card drops plan tasks from Work. Plan tasks stay on each project's Board and in its Planner.

## Scope
**In:** `GET /work` (API), the `WorkItem` contract, and the Work page's source filter and rows.
**Out:** the Board's plan tasks (`BoardPlanTasksController`, `apps/api/src/work/plan-tasks.service.ts`); the Planner.

## Current behaviour
- [Confirmed] `apps/api/src/work/work-query.service.ts:73-80`: `list` reads `cards` and `tasks` in parallel and merges them by keyset.
- [Confirmed] `work-query.service.ts:218-241`: `tasks()` pages plan tasks through `pageWorkTasks` (`apps/api/src/work/work-tasks.ts:150`).
- [Confirmed] `packages/shared/src/work/contracts.ts:102-116`: `WorkPlanTaskItem` (`source: 'plan'`) is part of `WorkItem`. `packages/shared/src/work/types.ts:10`: `WORK_SOURCES = ['card','plan','inbox','fleet']`.
- [Confirmed] `apps/web/src/components/work/work-table.tsx:62-73,204-206` branches on `source === 'plan'`.
- [Confirmed] `loadWorkTasks` in `work-tasks.ts` is also used by the Board's `plan-tasks.service.ts:10`, so it stays.

## Decisions
- Work is cards only (ADR-0098 §5; the person, 2026-10-26 interview: one place per thing).
- `WORK_SOURCES` becomes `['card','inbox','fleet']`. `GET /work?source=plan` is a 400 from the DTO's `IsIn`; the web never sends it.
- `WorkStatus` keeps only what cards have. `rejected` goes if no card can be in it. [Unknown] until the card checks `cardWorkStatus`.
- `pageWorkTasks` is deleted if nothing uses it after C-472.
- A stored URL with `?source=plan` opens Work with that filter dropped. The URL filter parser already drops unknown values; the card keeps a test for it.

## UI
Work's Source filter loses **Plan**. Rows are always cards. No new layout.

## Acceptance criteria
- [ ] `work.e2e.spec.ts`: a project with a plan of 3 tasks and 2 cards lists exactly the 2 cards. `?source=plan` is 400.
- [ ] `work.e2e.spec.ts` (authorization): a user sees only cards of projects they are a member of. The existing test still passes.
- [ ] `lib/work/format.test.ts`: `/work?source=plan&q=x` parses to filters without a source and keeps `q`.
- [ ] The Board's plan task rows still load (the `BoardPlanTasksController` e2e passes).
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-work-lists-cards-only.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Work and shows the Source filter without Plan.

## Risks
- There is no cross-project list of plan tasks any more, because C-472 also removes `GET /tasks`. A person looking for a plan task opens the project's Planner.

## Open questions
- None.
