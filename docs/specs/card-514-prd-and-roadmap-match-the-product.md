# C-514: Bring the PRD and the roadmap in line with the shipped product

Stack **S-21 "Docs match the product"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
C-406 asked for "the PRD and the roadmap match the product and this plan" and is closed, but both files still
describe retired or frozen features and the PRD carries a personal path. Documentation only.

## Scope
**In:** `docs/product/prd.md`, `docs/product/roadmap.md`.
**Out:** ADRs, specs, the docs site, any code.

## Current state
- [Confirmed] `docs/product/prd.md:38-40` — Goal 4 says "Claude Code and Codex are equal citizens" and gives the
  example `CLAUDE_CONFIG_DIR=~/.claude-profiles/blacktoorroot`, a maintainer's personal profile path.
- [Confirmed] `docs/product/prd.md:67` — Task queue: "create an issue from the UI". ADR-0098 §2 retired the web
  New issue dialog (`docs/adr/0098-…md:30-31`); the Queue lists incoming issues and makes a card from one.
- [Confirmed] `docs/product/prd.md:51` — "GitHub issues stay the queue for the orchestrator (ADR-0004)"; since
  ADR-0098 cards are the one work model and the Queue shows incoming issues.
- [Confirmed] `docs/product/prd.md:68` — Board columns "To Do → In progress → Review → Completed"; the columns are
  `inbox, todo, in_progress, finished, completed` (`packages/shared/src/protocol/local.ts:449-455`).
- [Confirmed] `docs/product/prd.md:73`, `:81` — Sessions and a Codex row present Codex as a live feature; Codex is
  frozen (`docs/product/roadmap.md:46-48`, spec 741).
- [Confirmed] `docs/product/prd.md:79` — Notifications: "in-app centre + Telegram bot" only. Email (ADR-0108) and
  Slack (ADR-0109) shipped in v0.18.0.
- [Confirmed] The feature table has no row for the Inbox (ADR-0106), Away mode rules (ADR-0105), account security
  (ADR-0081, ADR-0104, ADR-0113), the run queue (ADR-0102) or the hard-budget pause (ADR-0101).
- [Confirmed] `docs/product/roadmap.md:41` — M3.7 promises "a cross-project Tasks page"; `/tasks` now redirects to
  `/work?source=plan` (`apps/web/src/app/(app)/tasks/page.tsx:4`, `apps/web/src/lib/work/format.ts:190-195`).
- [Confirmed] `docs/product/roadmap.md:66-86` — M6 reads as a plan, but every card C-388…C-406 shipped in v0.18.0
  (`docs/releases/v0.18.0.md`).

## Decisions
- Docs describe the product as shipped; a frozen feature is marked frozen, not deleted (the person, 2026-10-26
  interview; roadmap M4 already does this).
- No personal paths, user names or profile names in the repository — the example becomes generic
  (`CLAUDE_CONFIG_DIR=~/.claude-work`).
- Shipped roadmap rows stay as history; only claims about what the product *does* change.

## What
1. PRD: rewrite Goal 4 (Claude Code is the runtime, launched through a runtime profile; Codex frozen, spec 741) with
   the generic example; fix the non-goal at :51, the Task queue row (incoming issues → "Make a card"), the Board
   columns, the Sessions row; mark the Codex row frozen; Notifications = in-app, Inbox, Telegram, email, Slack.
2. PRD: add rows (one line each, with the ADR) for Inbox, Away mode, Account security, Run queue and budgets (merge
   the pause into the Cost row). Update "Last reviewed".
3. Roadmap: M3.7 note says the Tasks page became the Work list (`/tasks` → `/work?source=plan`, #270); M6 heading
   says "shipped in v0.18.0" with a link to the release note.

## Acceptance criteria
- [ ] `grep -rn "claude-profiles\|blacktoorroot" docs/product` finds nothing.
- [ ] No sentence in `prd.md` says the web creates GitHub issues or that Codex is selectable today.
- [ ] The Board columns in `prd.md` equal `LOCAL_BOARD_COLUMNS`.
- [ ] Notifications lists in-app, Inbox, Telegram, email and Slack, each with its ADR.
- [ ] Roadmap M3.7 and M6 match the shipped state; every link resolves.
- [ ] `bun run check` passes. No UI change, so no demo.

## Open questions
- Add an M7 section for the 2026-10-26 plan? Default: yes, one paragraph that names the plan and says its stacks
  are on the Board, no item list (it would go stale).
