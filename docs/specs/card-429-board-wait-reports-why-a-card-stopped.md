# C-429: board_wait reports needs-person, review, PR and demo changes

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 3. Part of the 2026-10-26 improvement plan.

## Summary
A session driving the Board waits on `board_wait`, which reports column moves, round ends, CI changes, merges and
questions. A card that newly needs a person, a review step that blocked, a PR closed or retargeted on GitHub, and a
ready demo are silent, so the session polls `board_card` or misses them.

## Current state
- [Confirmed] Event types: `column`, `round_ended`, `ci`, `pr_merged`, `question`
  (`packages/shared/src/protocol/local.ts:726-759`).
- [Confirmed] The cursor entry holds `column, round, roundPhase, ciState, merged, questionKey`
  (`packages/shared/src/board/session-board.ts:42-49`, diff at `:166-235`); built in
  `apps/api/src/board/board-wait.service.ts:95-103`. Cursor cap 64 KiB (`local.ts:688`).

## Decisions
- New events (the person, 2026-10-26 interview):
  - `needs_person` `{reason}` when `needsPerson` turns on, `needs_person_cleared` when it turns off;
  - `review` `{from, to}` on a `CardReviewState` change (`idle/running/fixing/passed/needs_person`);
  - `pr` `{state: 'closed'|'reopened'} | {retargeted: {from, to}}` on a `prState` change other than a merge, or a
    `prBase` change;
  - `demo_ready` `{demoId}` when the card's newest demo becomes ready.
- Stack-run pauses are out: `board_list` already shows `stack.run.pause`, and the cursor is per card.
- The cursor version goes up; an old cursor is answered as no cursor (as today for a malformed one).

## API
- `BoardWatchCard`/`BoardWatchEntry` gain `needsPersonReason`, `reviewState`, `prState`, `prBase`, `demoId`; the encoding
  stays plain text and short (reasons and states as indexes).
- `board-wait.service.ts` fills them from the board view.
- `apps/runner/src/mcp/tools.ts`: the `board_wait` description lists the new types.

## Acceptance criteria
- [ ] Unit (`session-board.spec.ts`): each new event comes out of the diff once, in the documented order; an old-version
      cursor gives no events and a fresh cursor.
- [ ] Unit: a 1000-card cursor stays under `LOCAL_BOARD_WAIT_CURSOR_MAX`.
- [ ] e2e (`board-session.e2e.spec.ts`): a card marked `ci_still_failing` while a session waits wakes it with
      `needs_person`.

## Open questions
- None.
