# C-450: A round whose background task Claude Code no longer shows leaves `background`

Stack **S-18 "Sessions, terminal and runner"**, stage 1. New **ADR-0119** (amends ADR-0038).

## Summary
A round moves to `background` when its turn stops with background tasks still running, and back only on the next
activity. A task Claude Code stops tracking without a notification (its process killed, no restart) keeps the round
in `background` until the 30-minute stall warning, and messages to it were seen to sit unsent (C-413). The session's
own pane says whether Claude Code still has a background task; the runner already reads that pane every poll.

## Scope
**In:** a pure reader `apps/runner/src/cards/background-pane.ts`, the card poll in
`apps/runner/src/cards/executor.ts`, a `card_run.background_lost` event in
`packages/shared/src/protocol/events/cards.ts`, `apps/api/src/board/board-sink.ts`, ADR-0119, tests.
**Out:** killing a task (ADR-0038 keeps it out of scope); the web card (the existing `waiting` display applies).

## Current behaviour
- [Confirmed] `docs/adr/0038-a-round-waiting-on-its-own-background-tasks-is-not-waiting-for-the-person.md`
  Consequences: such a task "keeps a round in `background` until the next activity; the stall warning is what
  surfaces it. Killing tasks stays out of scope."
- [Confirmed] `apps/runner/src/hooks/map.ts:35-36,218-223`: `backgroundTasks` comes from the transcript at a stop.
- [Confirmed] `apps/api/src/board/board-sink.ts:741,759`: the sink sets and leaves `background` on hook events only.
- [Unknown] The exact footer Claude Code draws while a background task runs (a "background task" / shell count
  line). The card captures panes from the installed Claude Code version and pins them as fixtures.

## Decisions
- D1. **ADR-0119**: while a round is `background`, the runner reads the pane each poll. An idle prompt with **no**
  background-task indicator on 3 polls in a row means Claude Code tracks no task: the runner emits
  `card_run.background_lost {cardId, runId, projectId, at}` once per round stop. *Source: ADR-0038 Consequences; the
  2026-10-26 improvement plan.*
- D2. The API moves the round from `background` to `waiting`, clears the background fields, records an activity line
  ("The background task is gone; the worker waits for you") and raises `card.waiting` as for any stop. A round no
  longer in `background` ignores the event.
- D3. A pane that cannot be read, or shows the indicator, changes nothing — the reader errs towards `background`.
- D4. No capability is needed: an older runner never sends the event, and behaviour stays as ADR-0038.

## Acceptance criteria
- [ ] `background-pane.spec.ts` on captured panes: with a running background shell → indicator; after it finished
      or was killed → none; a busy pane → not idle.
- [ ] `executor.spec.ts`: a `background` round whose pane loses the indicator for 3 polls emits one
      `card_run.background_lost`; 2 polls emit nothing.
- [ ] Board e2e: the event moves a `background` round to `waiting` with `card.waiting`; a `running` round is not
      changed.
- [ ] `bun run check` and the api and runner tests pass.

## Risks
- A footer change in Claude Code makes the reader see "no indicator" always; D1's three idle polls and D3 limit the
  harm to a round shown as `waiting` early, which the next activity corrects.
- `board-sink.ts` may also be edited by another stack; this card adds one event branch only.

## Open questions
- Offer **Stop the background task** on the card when Claude Code still shows a task past the stall time? Default:
  no — killing stays out of scope (ADR-0038); a later card can add it.
