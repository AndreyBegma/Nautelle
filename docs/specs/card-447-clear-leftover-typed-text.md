# C-447: Leftover text the runner typed is submitted or cleared, so one stuck message does not block the rest

Stack **S-18 "Sessions, terminal and runner"**, stage 1. Needs C-433 (`inputText`, the verified submit).

## Summary
A pane whose input box still holds text reads as `other`. Every later message and every Steward nudge to that
session is then refused `not_at_input`, and a person's message to a busy session is appended to the leftover. One
message that was typed but never submitted blocks the session's messaging until someone opens the terminal.

## Scope
**In:** `apps/runner/src/steward/pane-rules.ts` (a `typed` state), `apps/runner/src/session/deliver.ts`, a per-session
"last text typed" memory beside it, tests.
**Out:** text the person typed themselves in the terminal (never touched); holding messages (C-453).

## Current behaviour
- [Confirmed] `apps/runner/src/steward/pane-rules.ts:31-33`: `other` includes "a half-typed input".
- [Confirmed] `apps/runner/src/steward/pane-rules.ts:168-169`: no empty prompt line → `{ state: 'other' }`.
- [Confirmed] `apps/runner/src/session/deliver.ts:36-38`: `other` is `not_at_input` for everyone; `busy` is typed
  into, after whatever the box holds.

## Decisions
- D1. `readPane` returns `state: 'typed'` when the input box holds text and no dialog, selector or permission prompt
  is up (`inputText` from C-433 is not empty). `StewardPaneReading.state` gains the value; every caller that
  switches on it is updated (`typed` is never `idle`).
- D2. The runner remembers, per session, the last text it typed and when (in memory, 10 min). When the pane is
  `typed` and the box holds exactly that text (whitespace-normalised, a `[Pasted text` fold counts as a match), it
  was ours: `deliverText` presses `C-m` once (C-433's verified submit), then delivers the new text.
- D3. When the box holds anything else, it is the person's: nothing is touched, and the result stays
  `not_at_input`. The web line for that outcome adds "or text is waiting in the input box".
- D4. Steward's `typeAtPrompt` goes through the same path, so its nudge also clears our own leftover.
  *Source: ADR-0040 (Steward types only at the prompt) — still true: it types at a prompt it just cleared.*

## Acceptance criteria
- [ ] `pane-rules.spec.ts`: captured panes with a half-typed box read `typed`; an empty box `idle`; a dialog over a
      typed box still `other` with its signal.
- [ ] `deliver.spec.ts`: our own leftover is submitted once, then the new text is typed and submitted; the result
      is `sent`. A box with someone else's text gets no key and `not_at_input`. This is the test that would have
      caught the blocked session.
- [ ] A Steward nudge to a session with our own leftover is delivered.
- [ ] `bun run check` and the runner and web tests pass.

## Risks
- Submitting leftover text sends a message the person may have given up on. It was reported `sent` to them before
  C-433, so they expect it delivered; the outcome line says so.

## Open questions
- Clear the leftover (`C-u`) instead of submitting it? Default: submit — the person asked for it to be sent.
