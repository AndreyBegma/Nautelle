# C-433: A text message to a session is reported `sent` only once it was submitted

Stack **S-18 "Sessions, terminal and runner"**, stage 0. Replaces Board card **C-413** (messages to a session in the
`background` phase sat typed but unsent); close C-413 when this card is created.

## Summary
`deliverText` types the text, sends `C-m` right behind it and answers `sent` without looking again. The answer
path already pauses after typed text and re-reads the pane (#967); the text path does not. Messages to a session
in the `background` phase were seen typed in the input box and never submitted, while the person was told `sent`.

## Scope
**In:** `apps/runner/src/session/deliver.ts`, a pure "what is typed in the input box" reader in
`apps/runner/src/steward/pane-rules.ts`, their tests.
**Out:** leftover text from an earlier message (C-447); holding a refused message (C-453).

## Current behaviour
- [Confirmed] `apps/runner/src/session/deliver.ts:39-41`: `sendLiteral`, `sendSubmit`, `return 'sent'` with no
  pause and no re-read.
- [Confirmed] `apps/runner/src/session/deliver.ts:53-57,113-125`: the answer path waits `settleMs` (150 ms) after a
  literal, re-reads up to `reads` (10) times and presses Enter once more when the screen did not move on.
- [Confirmed] `apps/runner/src/steward/pane-rules.ts:45`: only an *empty* input line is recognised; there is no
  reader for the text in a non-empty box.
- [Unknown] Why the `C-m` is dropped in the `background` phase (paste detection of the text burst is the likely
  cause, as in #189 and #967).

## Decisions
- D1. Text delivery uses the same `AnswerPacing` as answers: pause `settleMs` after the literal, then `C-m`, then
  re-read the pane up to `reads` times. *Source: #967 (the answer path); the 2026-10-26 improvement plan.*
- D2. Submitted means: the input box no longer ends with the text's last line (busy or idle, the box is empty or
  shows something else). Still there after the reads → press `C-m` once more and read again; still there →
  `not_at_input`. Never more than two submits, so a message is never sent twice.
- D3. `inputText(pane): string | null` in `pane-rules.ts` returns the text of the input box (the line(s) after the
  `│ >` / `❯` marker, box borders removed), or null when there is no input box. Pure, tested on captured panes.
- D4. Steward's `typeAtPrompt` (`apps/runner/src/cards/executor.ts:975-980`) goes through the same path and gains
  the check for free.

## Acceptance criteria
- [ ] `deliver.spec.ts`: a fake tmux whose pane keeps the typed text after the first `C-m` gets a second `C-m` and
      the result is `sent` once the box is empty; one that keeps it after the second is `not_at_input`, with
      exactly two `C-m` sent. This is the test that would have caught C-413.
- [ ] `deliver.spec.ts`: a pane that empties after the first `C-m` gets exactly one `C-m`; the pause before it is
      `settleMs` (fake `sleep` records it).
- [ ] `pane-rules.spec.ts`: `inputText` on captured panes — empty boxed input, empty `❯` input, one-line text,
      wrapped multi-line text, a pane with no input box.
- [ ] `messenger.tmux.spec.ts` (real tmux): a message to a session reported `sent` is no longer in the box.
- [ ] `bun run check` and the runner tests pass.

## Risks
- A long text that Claude Code folds into `[Pasted text #1]` does not end with the text's last line. D2 then sees
  the box changed and reports `sent` after one `C-m` only if the box is empty; a folded paste still in the box
  is matched by the `[Pasted text` marker as "still there".
- Adds up to ~1.5 s to a send. Acceptable; the API waits for the command result anyway.

## Open questions
- None.
