# C-401: Away mode: "allow similar" rules per session or project, and a configurable request timeout

Stack **S-15 "Core 3 — Fleet scale"**, stage *Fleet*.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- A tool-use request lives 5 minutes (`packages/shared/src/action-requests/contracts.ts:53-54`). After that the
  local dialog shows (`apps/runner/src/hooks/permission.ts`), so an unattended session in away mode stalls.
- Every call is decided one by one. Claude's `addRules` permission suggestions are present only in a test fixture
  and are never offered.

## Decisions (grilling session)
- Add **"allow similar"** and a **configurable timeout**.
- A rule can be remembered for the session or for the project. Project rules are visible and removable, and every
  rule is audited.
- Dangerous actions can never be remembered.

## What
1. **Buttons on a request** (web, Inbox C-390, Telegram):
   - **Allow**;
   - **Allow similar in this session**;
   - **Always allow in this project**;
   - **Deny**.
2. **Where a rule comes from.** Claude's permission suggestion (`addRules`) when present, otherwise the tool and
   command prefix.
3. **Project rules** are listed and removable in Settings. Every rule and every use of it is audited.
4. **A never-remember list** in shared code, with tests:
   - destructive shell, such as `rm -rf` and the like;
   - pushes to protected branches;
   - reads of secrets or credential files.
5. **The timeout** becomes a setting, per project and per account. The default is 5 minutes; it can go up to hours.

## Out of scope
- Approving a whole batch of requests at once. The person did not pick it.

## Touched areas
- `packages/shared/src/action-requests/contracts.ts`
- `apps/api/src/local/action-requests.service.ts`, `apps/api/src/local/action-request-expiry.job.ts`
- `apps/runner/src/hooks/permission.ts`
- `apps/api/src/telegram/action-request-actions.ts`
- Settings: a project rules list

## ADRs to read
- ADR-0020 (Claude Code integration through the runner), ADR-0052 (a tool-use request carries a redacted preview),
  ADR-0047 (runner-local policy).
- **A new ADR is needed**: remembered permission rules and the never-remember list.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] An away session that hits the same kind of call twice asks once.
- [ ] A dangerous call always asks, even with a matching rule.
- [ ] With a long timeout, the session keeps waiting instead of falling back to the local dialog.
- [ ] Project rules are visible, removable and audited.

## Tests
- Shared: rule matching and the never-remember list.
- API: e2e for allow-similar per session and per project, and for the timeout.
- Runner: the permission hook applies remembered rules.

## Open questions
- None.
