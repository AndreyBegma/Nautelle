# C-405: Slack notifications through an incoming webhook

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Teams live in Slack; Telegram is the only chat channel today.

## What
- A Slack incoming webhook URL per project (Settings) or workspace-wide (Admin), stored encrypted.
- The same events as Telegram (card finished with demo, question, failure, budget, merge), formatted with links that open Nautelle (no interactive buttons, no OAuth app).
- Per-event toggles; a test-send button.

## Done when
A finished card posts to the configured channel with its PR and demo link.

Spec: docs/specs/card-405-slack-notifications-through-an-incoming.md (PR #937)
