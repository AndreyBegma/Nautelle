# C-415: Accept a card whose PR head moved in one step: the refusal returns the new head

## Why
Accept merges only the head the person saw. When the PR moved, the refusal says only "review it again"; API clients read headRefOid by hand (the orchestrator did for every accept).

## What
- The 409 merge_failed/head_changed body carries the current headSha and diff link.
- Web accept dialog: a warn banner with the new short head and "Accept <sha7>" in place.
- Telegram: the moved-head answer shows the new head with a fresh Accept-and-merge button.
- Never merges an unseen head.

## Done when
- e2e: a stale head gets the current headSha in the refusal; dialog and Telegram accept the new head in one step.
- DemoFlow demo recorded.

Evidence: apps/api/src/board/board-work.ts:776-792; apps/web/src/lib/board/format.ts:373-374; telegram-card.service.ts:294-306

Spec: docs/specs/card-415-accept-a-moved-head-in-one-step.md
