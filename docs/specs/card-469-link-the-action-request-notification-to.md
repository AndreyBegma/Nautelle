# C-469: Link the action-request notification to the Inbox and describe tool-call asks

## Why
action.requested still opens Queue › Approvals, but the Inbox is where a request is decided (ADR-0106); the settings example names only the orchestrator, while most asks are tool calls in away mode.

## What
- Link becomes /inbox?kind=permission&actionRequest=<id>.
- The link parser accepts the new form and both old ones, so stored Telegram links keep working.
- Example text becomes a tool call.

## Done when
- Mapper spec covers all three link forms.
- Telegram approve from a new-link notification works.
- Bell item opens the Inbox filtered to permissions.
- DemoFlow demo recorded.

Evidence: apps/api/src/local/action-request-mapper.ts:147-158; apps/web/src/lib/notifications/format.ts:72

Spec: docs/specs/card-469-action-request-notification-opens-inbox.md
