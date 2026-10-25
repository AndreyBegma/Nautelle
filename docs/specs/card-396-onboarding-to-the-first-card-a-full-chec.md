# C-396: Onboarding to the first card: a full checklist, a repository picker and the setup link everywhere

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
The Getting started checklist ends at "Connect a project" and has no runtime profile step, although Run needs one (`onboarding/steps.ts`). Its optional steps never tick (hard-coded `done: false`). Connecting needs a typed absolute path (`connect-dialog.tsx:436`). Today two projects broke on a wrong base branch (main vs develop) and on push over SSH.

## What
- Checklist steps through to a first card with a PR: install, pair, connect a project, runtime profile, Claude Code plugin, push check, first card. Every step ticks from real state, including the optional ones.
- Connect: the runner lists git repositories under its allowed roots, so you pick one; it detects the base branch (develop if it exists and is used, else the default branch) and runs a push check (`git push --dry-run`) and reports it.
- The `/setup` link: also in the Helm NOTES and on a "no users yet" page served by the web app.

## Done when
A new install reaches a merged first card from the checklist without reading docs.

Spec: docs/specs/card-396-onboarding-to-the-first-card-a-full-chec.md (PR #937)
