# C-435: Reattach the web terminal by itself after a transient drop

Issue: #1055

## Why
When the runner socket drops, every attach ends and the terminal shows a final 'ended' state; the person has to close and reopen it. Only drops before the attach are retried.

## What
- A close after `attached` with a transient code or reason `socket` goes to `reconnecting` with the same backoff and deadline.
- `session_ended`, `idle`, `max_duration`, `client` and refusals stay final.
- A write attach comes back as read (one writer).

## Done when
- Supervisor and view tests for both paths; DemoFlow demo of a reconnect after a runner restart.

Evidence: apps/web/src/components/terminal/terminal-view.tsx:414-427; apps/web/src/lib/terminal/attach.ts:79-91.

Spec: docs/specs/card-435-web-terminal-reattaches-itself.md
