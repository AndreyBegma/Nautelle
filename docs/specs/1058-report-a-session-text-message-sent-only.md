# C-433: Report a session text message `sent` only once it was really submitted

Issue: #1058

## Why
A text message is typed, `C-m` is sent right behind it and the result is `sent` without looking again. Messages to sessions in the `background` phase sat typed in the input box, never submitted, while the person was told `sent` (C-413; this card replaces it).

## What
- Pace text like answers (#967): pause after the literal, submit, re-read the pane.
- Text still in the box: press `C-m` once more; still there: `not_at_input`. Never more than two submits.
- A pure `inputText(pane)` reader in pane-rules.

## Done when
- A fake pane that keeps the text gets a second `C-m` and ends `sent`, or `not_at_input` after two.
- A real-tmux test: a message reported `sent` is not left in the box.

Evidence: apps/runner/src/session/deliver.ts:39-41 vs 53-57,119-125 (#967); C-413.

Spec: docs/specs/card-433-submit-session-messages-verified.md
