# Roadmap

Milestones ship in order. Each row becomes one spec (`docs/specs/`) and one
GitHub issue via `/code-sentinel:spec`; large rows split into waves there.

## M1 — See the fleet

| # | Item | Notes |
|---|---|---|
| M1.1 | Auth: admin seed, login, registration toggle, approval with role, roles, project membership | ADR-0008 · [#3](https://github.com/AndreyBegma/Nautelle/issues/3) |
| M1.2 | Audit log foundation (hash chain) | every later privileged action writes here · [#8](https://github.com/AndreyBegma/Nautelle/issues/8) |
| M1.3 | Runner skeleton: `apps/runner`, pairing, WebSocket, heartbeat, capabilities, runtime profiles | ADR-0001, ADR-0006, [runner protocol](../architecture/runner-protocol.md) · [#5](https://github.com/AndreyBegma/Nautelle/issues/5), [#6](https://github.com/AndreyBegma/Nautelle/issues/6) |
| M1.4 | Projects: connect by path, detection (origin, config, base, docs source) | ADR-0012 · [#10](https://github.com/AndreyBegma/Nautelle/issues/10) |
| M1.5 | Fleet observation: tmux / worktree / board / reply-file collectors (markdown fallback) | ADR-0002 · [#11](https://github.com/AndreyBegma/Nautelle/issues/11) |
| M1.6 | Sessions: Claude + Codex transcript ingestion, session tree view | ADR-0003 · [#12](https://github.com/AndreyBegma/Nautelle/issues/12) |
| M1.7 | Tokens & API-equivalent cost: price table seed, OTel receiver in runner | ADR-0003, ADR-0009 · [#13](https://github.com/AndreyBegma/Nautelle/issues/13) |
| M1.8 | Shell UI: NavRail, project switcher, fleet overview, session view | glass-ui gaps: Spinner, StatTile, DataTable, TraceTree · [#9](https://github.com/AndreyBegma/Nautelle/issues/9) |

## M2 — Steer the fleet

| # | Item | Notes |
|---|---|---|
| M2.1 | code-sentinel: `events.jsonl` + `state.json` | [plugin changes](../plugin/code-sentinel-changes.md) · [#16](https://github.com/AndreyBegma/Nautelle/issues/16) |
| M2.2 | Orchestrator control: start / stop / next / status, stop slot, message worker | runner commands · [#17](https://github.com/AndreyBegma/Nautelle/issues/17) |
| M2.3 | Live pane (read-only) | glass-ui LogViewer · [#18](https://github.com/AndreyBegma/Nautelle/issues/18) |
| M2.4 | Task queue from GitHub + create issue | ADR-0004 · [#19](https://github.com/AndreyBegma/Nautelle/issues/19) |
| M2.5 | Merge approval queue | per-project switch · [#20](https://github.com/AndreyBegma/Nautelle/issues/20) |
| M2.6 | Activity feed + execution history | glass-ui Timeline · [#21](https://github.com/AndreyBegma/Nautelle/issues/21) |
| M2.7 | In-app notifications + Telegram bot | · [#22](https://github.com/AndreyBegma/Nautelle/issues/22) |

## M3 — Automate

| # | Item | Notes |
|---|---|---|
| M3.1 | Skills: skills.sh catalog, install, run with profile + model, report-or-PR | · [#24](https://github.com/AndreyBegma/Nautelle/issues/24) |
| M3.2 | Cron schedules + missed-run policy | · [#25](https://github.com/AndreyBegma/Nautelle/issues/25) |
| M3.3 | Webhooks: inbound triggers, outbound deliveries | · [#26](https://github.com/AndreyBegma/Nautelle/issues/26) |
| M3.4 | GitHub App: issue / PR / check events | ADR-0004 · [#27](https://github.com/AndreyBegma/Nautelle/issues/27) |
| M3.5 | Budgets: per project / per user, alert or hard stop | · [#28](https://github.com/AndreyBegma/Nautelle/issues/28) |
| M3.6 | Interactive terminal attach (admin only, audited) | · [#29](https://github.com/AndreyBegma/Nautelle/issues/29) |
| M3.7 | Planner: brief → tasks grilled per task → reviewed → sent to the fleet, with a plan graph and a cross-project Tasks page, which became the Work list (`/tasks` redirects to `/work?source=plan`) | ADR-0019 · [#172](https://github.com/AndreyBegma/Nautelle/issues/172) |
| M3.8 | Claude Code integration: plugin hooks + MCP through the runner, manual sessions first-class, opt-in content, away-mode remote approval | ADR-0020, ADR-0021 · [#201](https://github.com/AndreyBegma/Nautelle/issues/201) |
| M3.9 | Design stage: a per-task HTML mockup from a cached UI profile, reviewed with pins and approved before the fleet builds it | ADR-0022 · [#223](https://github.com/AndreyBegma/Nautelle/issues/223) |
| M3.10 | Project Board: AgentDock-owned cards, automatic and manual column moves, a review loop, Run a dedicated interactive worker per card | ADR-0024 · [#242](https://github.com/AndreyBegma/Nautelle/issues/242) |

## M4 — Codex (frozen)

Codex is not developed further ([spec 741](../specs/741-one-quota-detector-and-resume-at-reset.md), person, 2026-10-21). The rows stay as the design of record; nothing here is scheduled.

| # | Item | Notes |
|---|---|---|
| M4.1 | code-sentinel: `dispatch.sh --runtime codex` | ADR-0013 |
| M4.2 | Codex worker fence: worktree + sandbox + pre-merge ownership check | ADR-0013 |
| M4.3 | Codex as orchestrator (skill port) | |

## M5 — The Board era

Shipped between M3.10 and v0.17.0 (see [releases](../releases/README.md)). The Board
became the one work surface; the fleet and the queue became views onto it.

| # | Item | Notes |
|---|---|---|
| M5.1 | Cards that ship themselves: review steps, auto-merge when every check passed, a demo video recorded by DemoFlow | ADR-0035, ADR-0080, ADR-0084, ADR-0090 |
| M5.2 | Stacks, dependencies and stacked pull requests | ADR-0044, ADR-0054, ADR-0064, ADR-0065 |
| M5.3 | Steward: stuck-work detection, safe fixes, daily digest | ADR-0040 |
| M5.4 | Telegram bot and Mini App act on the Board; voice input; assistant | ADR-0046, ADR-0055, ADR-0057, ADR-0061 |
| M5.5 | Token saver and context handoff | ADR-0039, ADR-0042, ADR-0074 |
| M5.6 | Open-source install: one command, signed multi-arch images, Helm chart, documentation site | ADR-0088, ADR-0091, ADR-0092, ADR-0093, ADR-0097 |

## M6 — Core and UX plan (2026-10-25), shipped in v0.18.0

Shipped in [v0.18.0](../releases/v0.18.0.md). Settled with the person in a grilling session. The four stages go in order:
speed → daily flow → fleet scale → team. Nothing is removed in this iteration:
pages and routes stay; roles and entry points may change. Each stage is one
stack on the Board; each item is one card with a spec in `docs/specs/`, which
names its stack.

| Stage | Stack | Items |
|---|---|---|
| **1. Speed** | S-13 "Core 1 — Speed and reliability" | live updates instead of polling (C-388) · a card whose pull request merged completes by itself (C-389) · the Board page loads fast ([#933](https://github.com/AndreyBegma/Nautelle/issues/933)) |
| **2. Daily flow** | S-14 "Core 2 — Daily flow" | one work model: cards everywhere, Fleet as the live view, Queue as incoming issues (C-397) · thin card face (C-392) · Inbox for everything that waits on you (C-390) · quick card (C-391) · ⌘K and keyboard navigation (C-393) · approve a design from the sheet (C-394) · settings search (C-395) · onboarding to the first card (C-396) |
| **3. Fleet scale** | S-15 "Core 3 — Fleet scale" | run queue at the worker limit (C-398) · hard budget pauses rounds (C-399) · move a project to another runner (C-400) · away-mode "allow similar" rules (C-401) |
| **4. Team** | S-16 "Core 4 — Team" | email notifications (C-404) · personal API tokens (C-403) · Slack notifications (C-405) · password and 2FA reset (C-402) |

Housekeeping (C-406): the Steward digest is shown in Activity, shipped issues
are closed, and this PRD and roadmap match the product.

## M7 — Improvement plan (2026-10-26)

The next plan is tracked as stacks on the Board, not listed here.
