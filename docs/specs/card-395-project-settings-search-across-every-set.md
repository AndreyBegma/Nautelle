# C-395: Project settings: search across every setting, and a "Ready to run" block on top

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Project settings sit in 4 sections and about 15 former tabs. Run-critical settings are scattered (runtime profile, base branch, plugin checklist, auto-merge, review, demo videos). Budgets and token saver appear in 3–4 places.

## What
- A search field over every project setting (label and help text), also reachable from ⌘K, jumping to the setting.
- A **Ready to run** block at the top of Settings, listing: runtime profile, base branch, push access (from the runner), Claude Code plugin set up, demo videos (config present), each green or with its fix link.
- Duplicated entry points stay but all lead to one place where the setting is edited.

## Done when
Typing "budget" or "profile" finds the setting, and a project that cannot run says why at the top.

Spec: docs/specs/card-395-project-settings-search-across-every-set.md (PR #937)
