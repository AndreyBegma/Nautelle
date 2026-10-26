# C-514: Bring the PRD and the roadmap in line with the shipped product

Issue: #993

## Why
C-406 promised the PRD and roadmap match the product; they do not. The PRD still says the web creates GitHub issues (retired by ADR-0098), lists Codex as live (frozen, spec 741), names old Board columns, lists only in-app + Telegram notifications, and carries a personal CLAUDE_CONFIG_DIR path. The roadmap promises a cross-project Tasks page that became the Work list, and M6 reads as a plan though it shipped in v0.18.0.

## What
- Fix Goal 4, the non-goal on issues, the Task queue, Board, Sessions, Codex and Notifications rows; drop the personal path.
- Add one-line rows for Inbox, Away mode, account security, run queue and the hard-budget pause.
- Roadmap: M3.7 note, M6 marked shipped.

## Done when
- No personal path in docs/product; no claim of web-created issues or live Codex.
- Board columns equal LOCAL_BOARD_COLUMNS; notifications list all four channels with ADRs.

Evidence: docs/product/prd.md:38-40, :51, :67, :68, :79, :81; docs/product/roadmap.md:41, :66-86

Spec: docs/specs/card-514-prd-and-roadmap-match-the-product.md
