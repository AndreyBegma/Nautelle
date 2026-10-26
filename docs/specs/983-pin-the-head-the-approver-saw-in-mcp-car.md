# C-416: Pin the head the approver saw in MCP card_accept requests

Issue: #983

## Why
request_action card_accept {merge: true} binds title and PR but no head; on approval the API merges whatever head the PR has then, possibly unreviewed commits.

## What
- The bound args get `headSha` at creation; the approval merges that head.
- A moved head fails the request with `head_moved` and the current head; the session sees it in action_status.
- The approval row shows "at <sha7>" with the diff link. Old rows behave as today.

## Done when
- e2e: created at A, approved after the PR moved to B → not merged, head_moved with B (merges B today).
- DemoFlow demo recorded.

Evidence: packages/shared/src/action-requests/contracts.ts:242-248; apps/api/src/local/action-requests.service.ts:665-681

Spec: docs/specs/card-416-mcp-card-accept-pins-the-head.md
