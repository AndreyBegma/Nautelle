# C-434: Detect a dead runner socket on both ends and log why it dropped

Issue: #1057

## Why
The runner socket drops with 1006 about ten times a day. The disconnect line says only code and reason, and neither end notices a socket that went silent: nothing the server sends is periodic, and the gateway never pings.

## What
- The `disconnected` line carries lifetime, time since the last frame and since the last send.
- With a new `heartbeat_ack` server feature, the API answers each heartbeat with `ack`; the runner closes and reconnects after 45 s without any frame.
- The gateway pings live runner sockets and terminates one that misses two pings.

## Done when
- Fake-clock tests for the log fields, the watchdog (armed only with the feature) and the gateway ping.

Evidence: apps/runner/src/connection.ts:43,538; apps/api/src/runners/runner.gateway.ts:181-189.

Spec: docs/specs/card-434-detect-dead-runner-sockets.md
