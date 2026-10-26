# C-445: Read-only MCP tools wait for a reconnect instead of failing `runner_offline`

Stack **S-18 "Sessions, terminal and runner"**, stage 1 (after C-434, which also edits `connection.spec.ts`).

## Summary
A worker that calls `board_list`, `board_card`, `status` or `board_wait` during one of the runner's short
reconnects gets `runner_offline` at once and often gives up or improvises. Only `card.finish` waits for the
connection today. Reads are safe to repeat, so they should wait the same way.

## Scope
**In:** `LOCAL_RETRY_METHODS` in `apps/runner/src/local/types.ts`, its test.
**Out:** write methods (they keep failing fast, #434); the retry window.

## Current behaviour
- [Confirmed] `apps/runner/src/local/types.ts:26-28`: `LOCAL_RETRY_METHODS` holds `card.finish` only.
- [Confirmed] `apps/runner/src/connection.ts:214-218,226-243`: a method in the set retries `runner_offline` with
  backoff for `LOCAL_RETRY_WINDOW_MS` (2 min); every other method answers `runner_offline` at once
  (`:248-251`), and a drop mid-request too (`:299-306`).
- [Confirmed] the read methods the MCP server relays (`apps/runner/src/mcp/`): `board.list`, `board.card`,
  `board.wait`, `fleet.status`, `sessions.recent`, `activity.recent`, `queue.list`, `approvals.list`,
  `budget.remaining`, `action.status`.

## Decisions
- D1. Those ten read methods join `LOCAL_RETRY_METHODS`. *Source: #434 (idempotent methods may wait);
  the 2026-10-26 improvement plan.*
- D2. The set's doc comment says "idempotent on the server: reads, and `card.finish`".
- D3. The exhausted message (`LOCAL_RETRY_EXHAUSTED_MESSAGE`) stays as is; it already tells the worker to call
  again.

## Acceptance criteria
- [ ] `connection.spec.ts`: a `board.list` request sent while the socket is down is answered after the connection
      comes back, not with `runner_offline`; a `card.move` sent while down still fails at once.
- [ ] A test pins the set to the ten read methods plus `card.finish`, so a new write method is never added by
      accident.
- [ ] `bun run check` and the runner tests pass.

## Risks
- `board.wait` already blocks for its own timeout; waiting for a reconnect adds at most the 2-minute window.

## Open questions
- None.
