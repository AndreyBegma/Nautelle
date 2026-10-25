# C-411: Board relays only the first tab of a multi-question selector, and an "other" answer is typed but not submitted

Issue: #967

## What happened (2026-10-25, C-404 and C-405)
Card sessions asked AskUserQuestion forms with several questions (tabs such as "Question to · Digest time · Submit" and "Events · Finished · Submit").
1. `GET /board/cards/:n` (`question`) and `board_wait` exposed only the **first** tab. After it was answered, `question` went back to `null` while the session sat on tab 2 for hours. The card showed `roundPhase: waiting` and `waitingOnQuestion: false`.
2. Answering tab 1 through `card_message` with `kind: other` returned `{"outcome":"answered"}`, but the text was only **typed** into the "Other" field. The session waited for Enter (C-404 stood still from 13:09 to ~17:30). It was unblocked only by a manual Enter in tmux.

## Fix
- Relay every question of a multi-question form, each with its own key and options, plus the final Submit step, and expose them in `question` and in `board_wait` until the form is submitted.
- An `other` answer must submit the field (and move to the next tab, or submit at the end). `outcome: answered` only when the session really moved on; otherwise report `not_at_input`.
- A card whose session waits on any form tab shows `waitingOnQuestion: true`, so Needs-you and the Inbox list it.

## Done when
- A two-question form is answered end to end through `card_message` with no terminal access (runner test with a recorded pane, and e2e for the API state).
- `waitingOnQuestion` is true while any tab is pending.

Migration/ADR numbers if needed: 20261231000038, ADR 0111.
