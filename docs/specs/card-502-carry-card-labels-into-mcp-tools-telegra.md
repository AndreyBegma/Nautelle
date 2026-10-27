# C-502: Carry card labels into MCP tools, Telegram card text and the Work list

## Why
Labels set on the Board should be visible wherever a card is read or made: agent sessions, Telegram and the Work list.

## What
- MCP: `card_create` takes `labels` by name (a person's choice, so no model call; unknown names refused with the list); `board_list` and `board_card` return labels with their source.
- Telegram: a `Labels:` line in the card text.
- Work list: the same left-edge stripe as the Board.
- The card sheet's Manage labels link to Settings › Labels.

## Done when
- API e2e for create with labels, unknown names and cross-project reads; Telegram text test; Work list unit test.
- Light, dark and phone screenshots match the design; DemoFlow demo recorded.

Evidence: apps/runner/src/mcp/tools.ts:249-321; apps/api/src/telegram/board-actions.ts:247-276

Spec: docs/specs/card-502-labels-in-mcp-telegram-and-the-work-list.md
