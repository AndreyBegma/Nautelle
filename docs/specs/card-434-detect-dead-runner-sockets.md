# C-434: Detect a dead runner socket on both ends, and log why it dropped

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
The runner's socket drops with code 1006 about ten times a day. The disconnect line says only `{code, reason}`,
and neither end notices a socket that went silent: the runner keeps "live" until the OS reports the close, and
the API keeps the runner `online`/`stale` on the last heartbeat. This card adds the facts needed to find the
cause and makes both ends close a silent socket so the runner reconnects at once.

## Scope
**In:** `apps/runner/src/connection.ts`, `apps/api/src/runners/runner.gateway.ts`, a server feature flag in
`packages/shared/src/protocol/`, their tests.
**Out:** changing the heartbeat interval; the backoff policy.

## Current behaviour
- [Confirmed] `apps/runner/src/connection.ts:538`: `log.warn('disconnected', { code, reason })` — no lifetime, no
  time since the last frame. `openedAt` exists (`:160,328`) but is only used for the backoff reset (`:531-536`).
- [Confirmed] `apps/runner/src/connection.ts:43`: heartbeat every 15 s, runner → server. Nothing the server sends
  is periodic, so the runner has nothing to time out on.
- [Confirmed] `apps/api/src/runners/runner.gateway.ts:181-189`: a heartbeat updates `lastBeatAt`; there is no
  ping and no timer that closes a socket gone quiet. `apps/api/src/runners/status.ts:17` only derives `stale`.

## Decisions
- D1. **Diagnostics.** The runner's `disconnected` line carries `code`, `reason`, `livedMs` (since `onopen`),
  `sinceLastFrameMs` (since the last message received), `sinceLastSendMs`, and `wasLive`. The API logs the close
  of a live runner socket with its lifetime and time since the last frame too.
- D2. **The server answers each heartbeat.** With `heartbeat_ack` in `welcome.features`, the API replies to every
  `heartbeat` with the existing `ack` message (`seq` = the runner's acked seq). No new message type. *Source:
  ADR-0010 (typed messages only) — an existing type, additive feature flag.*
- D3. **Runner watchdog.** Only when the server advertised `heartbeat_ack`: if nothing arrived for
  3 × `HEARTBEAT_INTERVAL_MS` (45 s), the runner closes the socket with 4000 `"no frames"` and reconnects through
  the normal backoff. An older API never arms it.
- D4. **API ping.** The gateway sends a WebSocket ping every 20 s to each live runner socket and terminates one
  that has not answered two pings (`ws` `terminate()`). Bun's client answers pings by itself.

## Acceptance criteria
- [ ] `connection.spec.ts` (fake clock): the `disconnected` line carries every D1 field with the right values.
- [ ] `connection.spec.ts`: with `heartbeat_ack` advertised and no frame for 45 s, the runner closes and schedules
      a reconnect; without the feature it never does.
- [ ] Gateway spec: a heartbeat is answered with `ack`; a socket that answers no ping is terminated after two
      intervals and the runner goes `offline`.
- [ ] `bun run check` and the api and runner tests pass.

## Risks
- A runner on a very slow link could be closed by D3 while still alive. 45 s against a 15 s heartbeat that is
  answered at once leaves room; the reconnect is cheap (spool resend).

## Open questions
- Should the watchdog interval be configurable? Default: no, a constant beside `HEARTBEAT_INTERVAL_MS`.
