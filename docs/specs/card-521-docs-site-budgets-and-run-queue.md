# C-521: Docs site — budgets, the hard-budget pause and the run queue

Stack **S-21 "Docs match the product"**, stage 1 (after C-515). Part of the 2026-10-26 improvement plan.

## Summary
How much the fleet may spend and how many cards run at once are the two limits an operator meets first; neither has
a docs page. Write one.

## Scope
**In:** `apps/docs/src/content/docs/using/budgets-and-run-queue.md` (frontmatter `sidebar.order: 4`).
**Out:** the sidebar config, other pages, app code.

## Current state
- [Confirmed] Budgets: per project and per user, `alert` or `stop`; days, weeks and months cut in `APP_TIMEZONE`
  (`configuration/environment.md:57`); set in Admin › Budgets (`apps/web/src/app/admin/budgets/page.tsx`) and the
  project's Settings › Cost › Budget (`docs/ui/screens.md`, Project → Settings row).
- [Confirmed] A reached `stop` budget pauses the running board card rounds in its scope within about a minute; the
  card stays In progress and reads **Paused: budget**; orchestrator slots, fleet and terminal cards, skill runs and
  a person's own sessions are not stopped; an override lifts the pause; Resume continues the session
  (ADR-0101 §1–4).
- [Confirmed] Run queue: Run on a full Board queues a To Do card instead of refusing; queued cards start in To Do
  order, dragging reorders; cards outside To Do and cards with an open dependency are still refused; the limit is
  the project's Board setting `maxRunning` (ADR-0102 §1–3;
  `apps/web/src/app/(app)/projects/[projectId]/settings/board-tab.tsx:68-99`).

## What
Sections: **Budgets** (scopes, alert vs stop, periods, where to set) · **When a hard budget is reached** (what
pauses, what does not, how to resume or override) · **How many cards run at once** (the limit, the queue, order,
what is still refused, stacks share the queue).

## Acceptance criteria
- [ ] `bun run --cwd apps/docs build` passes; the page is fourth under **Using Nautelle**.
- [ ] Every rule matches ADR-0101 and ADR-0102; the setting names match the UI labels.
- [ ] `bun run check` passes. No app UI change, so no demo.
