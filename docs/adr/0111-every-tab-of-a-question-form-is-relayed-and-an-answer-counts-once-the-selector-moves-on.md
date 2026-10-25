# ADR-0111: Every tab of a question form is relayed, and an answer counts once the selector moves on

Status: accepted · Date: 2026-10-25 ·
Issue: [#967](https://github.com/AndreyBegma/Nautelle/issues/967) ·
Spec: [`docs/specs/967-board-relays-only-the-first-tab-of-a-mul.md`](../specs/967-board-relays-only-the-first-tab-of-a-mul.md) ·
Amends [ADR-0094](0094-a-card-sessions-question-selector-is-reported-on-every-project.md) ·
Card: C-411

## Context

A card worker can ask several questions in one `AskUserQuestion` call. Claude
Code then draws a form: a row of tabs (`←  ☐ Time  ☐ Channel  ✔ Submit  →`),
one question at a time, and a closing "Ready to submit your answers?" screen.
The Board relayed only the first tab, and then `question` went null and
`waitingOnQuestion` went false while the form still waited. Recordings of
Claude Code 2.1.310 panes showed three causes:

- On an 80-column pane, with the cursor on the "Type something." field, the
  key-hint footer (`Enter to select · Tab/Arrow keys to navigate · … · Esc to
  cancel`) wraps onto a second line. The reader required the footer on the
  last line, so it saw no selector and the runner reported `question: null`.
- An answer typed its text and pressed Enter right behind it, then returned
  `answered` without looking. When that Enter was not taken, the text stayed
  in the field and the person was told it had been answered.
- A multi-select tab shows `[ ]` boxes, an unnumbered `Next` (or `Submit`)
  row, and Enter ticks a box instead of moving on. The reader did not know
  that layout, so an answer never left the tab.

## Decision

1. **The footer may wrap.** The reader looks for the key-hint footer joined
   from up to three last lines, and keeps footer lines out of the question.
2. **Each tab is relayed as it comes up.** The pane shows one tab at a time,
   so every tab is its own `PendingQuestion` with its own key, and the round
   stays waiting through all of them. A question of a form carries
   `form: { tabs: [{ label, answered }], step }`; `step` is `submit` on the
   closing screen, whose options are Submit answers and Cancel. Listing every
   tab's options up front would need the tool input, which is session content
   (ADR-0021).
3. **Multi-select tabs are read and answered.** Their options carry
   `checked`, the question carries `multiSelect: true`. An option answer ticks
   that box (unless it is ticked) and then selects `Next`; an "Other" answer
   types into the typed box and selects `Next`.
4. **`answered` means the selector moved on.** After its keys, the runner
   reads the pane until the selector shows another tab, the Submit screen or
   nothing. Typed text gets a short pause before its Enter. If the pane still
   shows the same question with the cursor where the Enter went, Enter is
   pressed once more. A selector that still stays is `not_at_input`; nothing
   further is sent.

## Consequences

- `waitingOnQuestion`, `board_card`, `board_wait` and the web card follow a
  form tab by tab. A new tab's key is a new `board_wait` question event.
- A `card_message` answer can take up to a couple of seconds longer while the
  runner waits for the pane, still well inside the 15 s command timeout.
- `not_at_input` now also means "the keys were sent, but the selector did not
  move"; the caller reads the card again before answering again.
- The web card and Telegram show each tab as a question of its own; they do
  not yet draw the tab row from `form`.
- Runners from before this change keep the old behaviour; the fix needs the
  runner update.
- Rejected:
  - **Report the whole form at once from the tool input.** It is session
    content, and the pane is what an answer acts on anyway.
  - **Return `answered` as soon as the keys are sent.** It is what told the
    person a question was answered while its text sat unsubmitted.
