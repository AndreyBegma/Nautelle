# C-416: MCP card_accept pins the head the approver saw

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
A session's `request_action card_accept {merge: true}` binds the card's title and PR, but not its head. When a person
approves, the API merges whatever head the PR has then, which may be commits nobody reviewed. The request now binds
the head, shows it to the approver, and refuses with the new head if it moved.

## Current state
- [Confirmed] `cardAcceptBoundArgsSchema` holds `card, merge, title, prNumber, prUrl`, no head
  (`packages/shared/src/action-requests/contracts.ts:242-248`); `bindCard` reads it at creation
  (`apps/api/src/local/action-requests.service.ts:304-333`).
- [Confirmed] On approve, the head is read at decision time and merged: `pullRequest(...)` then
  `accept(..., {merge: {headSha: pr.headSha}})` (`action-requests.service.ts:665-681`).
- [Confirmed] Errors of the approvals routes already carry `headSha` for `head_moved`
  (`packages/shared/src/approvals/contracts.ts:160-162`), and `prDiffUrl` exists (`action-requests/contracts.ts`).

## Decisions
- Bind `headSha` (the card's `ciHeadSha`, or the PR read through the runner when that is null) when the request is
  created. The approver approves that head (the person, 2026-10-26 interview; ADR-0083 §10 "what the approver is
  shown"). No new ADR.
- Old rows without `headSha` keep today's behaviour.

## API
- `cardAcceptBoundArgsSchema`: `headSha: z.string().regex(/^[0-9a-f]{40}$/).nullable().optional()`.
- `bindCard` fills it; `decide` merges with the bound head. A `merge_failed`/`head_changed` comes back as the
  request's failed result `{code: 'head_moved', headSha}` (the current head, from C-415's body or a read). The
  session sees it through `action_status` and may file a new request.
- `action-request-mapper.ts`: the summary says "and merge #<pr> at <sha7>".
- `apps/runner/src/mcp/tools.ts:212-219`: the `request_action` description says the head is pinned.

## UI
- The approval row (`apps/web/src/lib/approvals/action-requests.ts` and its component) shows `at <sha7>` with the
  `prDiffUrl` link. glass-ui only.

## Acceptance criteria
- [ ] e2e (`apps/api/src/local/action-requests*.e2e.spec.ts`): a request created at head A, approved after the PR moved
      to B, does not merge and returns `head_moved` with B. Fails today: it merges B.
- [ ] e2e: approved at an unchanged head, it merges A.
- [ ] Web test: the row shows the short head and diff link.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-mcp-card-accept-pins-the-head.demo.json` (sign-in fragment in `setup`).

## Risks
- None beyond a second request when the head moves.

## Open questions
- Let the session pass `headSha` itself? Default: no; the API binds what it reads.
