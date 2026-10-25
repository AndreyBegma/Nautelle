# C-401: Away mode: "allow similar" rules per session or project, and a configurable request timeout

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
A tool-use request lives 5 minutes (`packages/shared/src/action-requests/contracts.ts:53-54`); after that the local dialog shows (`apps/runner/src/hooks/permission.ts`), so an unattended session stalls. Every call is decided one by one; Claude's `addRules` suggestions are never offered.

## What
- On a request (web, Inbox, Telegram): **Allow**, **Allow similar in this session**, **Always allow in this project**, **Deny**. The rule comes from Claude's permission suggestion (`addRules`) when present.
- Project rules are listed and removable in Settings; every rule and every use is audited.
- Dangerous actions can never be remembered: destructive shell (rm -rf and the like), pushes to protected branches, reading secrets or credential files. Keep the list in shared code with tests.
- The request timeout becomes a setting (default 5 min, up to hours) per project or account.

## Done when
An away session that hits the same kind of call twice asks once, a dangerous call always asks, and a long timeout keeps the session waiting instead of falling back.

Spec: docs/specs/card-401-away-mode-allow-similar-rules-per-sessio.md (PR #937)
