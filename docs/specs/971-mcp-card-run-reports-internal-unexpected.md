# C-412: MCP card_run reports "internal: unexpected card.run result" when the Board queues the card

Issue: #971

## What happened (2026-10-25)
Since C-398 (run queue, PR #953) Run at the worker limit queues the card instead of refusing it. Calling the MCP tool `card_run` on C-380 with 5/5 running returned `internal: unexpected card.run result`, but the card was correctly queued (`queue: {state: "queued", place: 1}`).

## Fix
Make the runner's MCP `card_run` tool (`apps/runner/src/mcp/tools.ts` and its handler) understand the queued answer of `POST /board/cards/:n/run`. Return something like `{number, queued: true, place}`, and update the tool description, which still says a full Board refuses with `max_running`. Do the same for `stack_run` if it has the same gap, and check `card_feedback`, which still answers `max_running` at the limit. Say in the PR whether feedback rounds should queue too; if so, file a follow-up card.

## Done when
- `card_run` at the limit returns a queued result with the place, no internal error, and a test covers it.
- The tool descriptions match the new behaviour.

Migration/ADR numbers if needed: 20261231000039, ADR 0112.
