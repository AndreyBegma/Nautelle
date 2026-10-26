# C-435: The web terminal reattaches by itself after a transient drop

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
When the runner's socket drops, every attach ends (spec 29 D7) and the terminal view shows a final "ended"
state; the person has to close and reopen it. A drop before the attach is already retried. A drop after it should
be retried the same way while the session still runs.

## Scope
**In:** `apps/web/src/components/terminal/terminal-view.tsx`, `apps/web/src/lib/terminal/attach.ts`, their tests,
a DemoFlow demo.
**Out:** the runner and API side of attach; terminal history (C-451).

## Current behaviour
- [Confirmed] `apps/runner/src/connection.ts:517-523`: a closed runner socket calls `terminal.reset()`; every
  attach ends with reason `socket` (`packages/shared/src/protocol/terminal.ts:77-78`).
- [Confirmed] `apps/web/src/components/terminal/terminal-view.tsx:414-427`: a close is retried only when
  `!attached && !outcome && isTransientCloseCode(code)`; otherwise `supervisor.dispose()` and a final status.
- [Confirmed] `apps/web/src/lib/terminal/attach.ts:79-91`: `AttachSupervisor.attemptFailed` retries with
  `attachRetryDelay` only while not yet attached.

## Decisions
- D1. A close after `attached` is retried when it is transient: the close code is transient
  (`isTransientCloseCode`) **or** the end reason is `socket`. `session_ended`, `idle`, `max_duration`, `client`
  and refusals stay final. *Source: the 2026-10-26 improvement plan (candidate 9).*
- D2. The supervisor gets `dropped()` for this case: state `reconnecting`, same backoff and the same
  `ATTACH_GIVE_UP_MS` deadline, a new ticket per attempt. The xterm is kept (its screen stays readable); tmux
  redraws it on reattach.
- D3. A `write` attach reattaches as `read` and the person presses **Take control** again — the hold may have
  gone to someone else meanwhile. *Source: spec 29 D7 (one writer).*

## UI
The existing reconnecting status line ("Reconnecting…, attempt n") of the attach phase, also after a drop. No new
component.

## Acceptance criteria
- [ ] `attach.test.ts`: after `attached`, `dropped()` moves to `reconnecting`, retries with backoff and gives up at
      the deadline; `dispose()` stops it.
- [ ] `terminal-view` test: a `terminal.close` with reason `socket` after `attached` starts a new attempt; reason
      `session_ended` shows the final state.
- [ ] A write attach comes back as read.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-web-terminal-reattaches-itself.demo.json` (sign-in through
      `demoflow/fragments/sign-in.json` in `setup`): a terminal open, the runner restarted, the view shows
      reconnecting and comes back live.
- [ ] `bun run check` and the web tests pass.

## Risks
- A session that ended during the drop answers the reattach with a refusal; the view then shows that refusal,
  which is the right final state.

## Open questions
- None.
