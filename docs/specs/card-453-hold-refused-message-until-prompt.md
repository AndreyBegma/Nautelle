# C-453: A message refused with `not_at_input` is held and delivered at the session's next prompt

Stack **S-18 "Sessions, terminal and runner"**, stage 2. Needs C-433 and C-447 (verified submit, `typed` state).
New **ADR-0118** (amends ADR-0045 §3).

## Summary
A text message that arrives while a dialog or permission prompt is up is refused `not_at_input` and dropped; the
person has to watch the card and send it again. The runner already polls every card session's pane, and a dialog
usually clears within minutes. It can keep the text for a short window and type it as soon as the session is back at
its input box.

## Scope
**In:** `apps/runner/src/session/messenger.ts` (the hold), `packages/shared/src/session-message/contracts.ts` (the
`held` outcome), `packages/shared/src/protocol/commands/session-message.ts` (the `hold` arg), a
`session.message_delivered` event, `apps/api/src/session-message/` (sends `hold`, records the later outcome),
`apps/web/src/lib/session-message/format.ts`, `apps/api/src/telegram/session-message-actions.ts`, the `card_message`
description in `apps/runner/src/mcp/tools.ts`, ADR-0118, tests.
**Out:** answers to a question (`option`, `other`) — never held, the screen they name may be gone; Steward nudges
(they stay idle-only and are not held).

## Current behaviour
- [Confirmed] `apps/runner/src/session/deliver.ts:36-38`: not at an input box → `not_at_input`, nothing kept.
- [Confirmed] `packages/shared/src/session-message/contracts.ts:140-158`: the outcomes; `not_at_input` means nothing
  was sent.
- [Confirmed] `packages/shared/src/protocol/commands/session-message.ts:45-49`: the args are a `strictObject`, so an
  older runner refuses a new key.
- [Confirmed] `apps/web/src/lib/session-message/format.ts:28-31`: the line says the session did not take it.

## Decisions
- D1. **ADR-0118**: a text message the session cannot take now is held on the runner for `SESSION_MESSAGE_HOLD_MS`
  (10 min), in memory, at most one per session (a newer one replaces it and the older is reported `replaced`). The
  outcome is `held`. *Source: ADR-0045 §3 (busy is queued, not interrupted) — extended to a dialog that will clear.*
- D2. The runner checks held messages every 2 s; when the session is `idle`, `busy` or (C-447) holds our own
  leftover, it delivers through `deliverText` and emits `session.message_delivered {target, heldAt, outcome}` with
  `sent`, `expired`, `no_session` or `replaced`. A runner restart drops held messages and reports nothing; the API
  treats a hold older than the window as expired.
- D3. The API sends `hold: true` only to a runner that advertises `sessionMessageHold`, and only for `text`. The
  later event updates the message's audit row and adds an activity line on the card or slot.
- D4. Copy: `held` — "The session shows a dialog; the message is sent as soon as it is back at its prompt (up to
  10 min)." `expired` — "The held message was not sent: the session stayed busy with a dialog."

## Acceptance criteria
- [ ] Messenger test (fake clock and tmux): a text to a pane with a dialog returns `held`; the dialog gone, the next
      check types it and emits `sent`; after 10 min with the dialog still up it emits `expired` and types nothing.
- [ ] A second held text for the same session replaces the first, which is reported `replaced`.
- [ ] An `option` answer to a pane with a dialog is still `not_at_input`, never held.
- [ ] Session-message e2e: `hold` is sent only to a runner with the capability; the delivered event updates the
      audit row; an operator of another project cannot read it.
- [ ] Web and Telegram show the `held` and `expired` lines.
- [ ] `bun run check` and the api, runner and web tests pass.

## Risks
- A held message lands minutes later, when the context may have moved on. The window is short and the person sees
  the delivery line.

## Open questions
- Should the person be able to cancel a held message? Default: no — sending a new one replaces it.
