# C-517: List every root script in the developer docs (issue #261)

Stack **S-21 "Docs match the product"**, stage 0. Part of the 2026-10-26 improvement plan. Closes #261.

## Summary
A newcomer has to read `package.json` to find half the scripts. Issue #261 asks for the README's Development table
to list them all, but since #261 was filed the README lost its table (it has a quick-start block) and the Commands
table moved from `CLAUDE.md` to `docs/guides/agent-rules.md` (ADR-0068). Complete that table and link it from the
README.

## Scope
**In:** `docs/guides/agent-rules.md` (Structure and Commands), `README.md` (one link under the quick start).
**Out:** `CLAUDE.md` (it already points at agent-rules.md), the scripts themselves.

## Current state
- [Confirmed] Root scripts (`package.json`): build, start:dev, lint, test, typecheck, db:up, db:down, db:migrate,
  db:generate, db:seed, db:studio, db:setup, admin:create, format, check:secrets, docs:env, docs:dev, check.
- [Confirmed] `docs/guides/agent-rules.md:22-35` lacks typecheck, db:up, db:down, db:seed, admin:create, format,
  docs:env, docs:dev; its Structure block (`:12-19`) lacks `apps/runner/` and `apps/docs/`.
- [Confirmed] API test scripts `test:unit`, `test:e2e`, `test:watch`, `test:cov` (`apps/api/package.json:12-15`).
- [Confirmed] `README.md:187-196` is a quick-start code block, no table.

## Decisions
- One full table, in `agent-rules.md`; the README keeps its short quick start and links the table, so the list is
  not kept in two places (the person, 2026-10-26 interview: remove duplication). The PR says so when it closes #261.

## What
1. Structure: add `apps/runner/` (the runner daemon) and `apps/docs/` (the Starlight site).
2. Commands: one row per root script, in `package.json` order, with what it does (read `scripts/db-start-docker.sh`
   for db:setup vs db:up); a note under it for the API's `test:*` scripts.
3. README: under the quick start, "Every script: [agent rules › Commands](docs/guides/agent-rules.md#commands)".

## Acceptance criteria
- [ ] Every key of the root `package.json` `scripts` appears once in the Commands table.
- [ ] Descriptions match what the scripts run.
- [ ] The README link resolves. `bun run check` passes. No UI change, so no demo.
