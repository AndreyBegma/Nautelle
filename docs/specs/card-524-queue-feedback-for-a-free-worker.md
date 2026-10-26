# C-524: Queue a feedback round refused for a free worker instead of dropping it

Stack **S-17 "Card flow: rounds, accept and shipping"**, last stage. Part of the 2026-10-26 improvement plan; found
while running it.

## Summary
A person's feedback on a Finished card starts a round. When every worker slot of the project is busy it is refused
`409 max_running`, and nothing retries it. While stacks run, each freed slot goes at once to the next queued To Do
card (ADR-0102), so a feedback can be refused indefinitely. On 2026-10-26 three feedbacks (two demo-scenario fixes
and an ADR renumber) were refused for over an hour until the orchestrator raised `maxRunning` for a moment. C-418
made `ci_fix` and `review_fix` rounds wait for a slot ahead of To Do; feedback, which a person wrote, needs the same,
and it must survive an API restart because it carries the person's text and attachments.

## Scope
**In:** the API feedback path, a stored feedback wait, the run queue serving it, the web card sheet, MCP
`card_feedback`, Telegram feedback, an e2e suite, a DemoFlow demo, a note in ADR-0102.
**Out:** `card_message` to a running session (it needs a running round, not a slot); ci_fix/review_fix waits (C-418
keeps them in memory); changing `maxRunning` semantics.

## Current state
- [Confirmed] `BoardRoundsService.feedback` (`apps/api/src/board/board-rounds.service.ts:496-523`) checks the column
  and calls `start(...)`; `start` refuses with `BOARD_ERROR.maxRunning` when `active >= maxRunning`
  (`board-rounds.service.ts:1747-1763`). The refusal goes straight back to the caller.
- [Confirmed] C-418 added `BoardFixWaits` (`apps/api/src/board/board-fix-waits.ts`): in-memory waits for refused
  `ci_fix`/`review_fix` rounds; while one waits, `BoardRunQueue` starts no To Do card
  (`apps/api/src/board/board-run-queue.ts:527`) and serves the waits first, oldest first (`serveFixes`,
  `board-run-queue.ts:640` onward).
- [Confirmed] Feedback is sent from the card sheet (`apps/web/src/components/board/card-sheet.tsx`,
  `apps/web/src/lib/board/actions.ts`), MCP (`apps/api/src/local/local-board-handlers.ts`,
  `apps/runner/src/mcp/tools.ts`, contract in `packages/shared/src/protocol/local.ts`) and Telegram
  (`apps/api/src/telegram/card-actions.ts`, `telegram-card.service.ts`).

## Decisions
- Feedback refused for room is **queued, not refused** (the person, 2026-10-26: "this is a Board defect — file it
  properly").
- The wait is **stored in the database**, not in memory: it holds a person's text and attachment ids, and losing it
  on a restart would drop their words silently. Fix waits stay in memory (C-418), since the shipping poll re-creates
  them. [New decision — recorded as a note in ADR-0102, no new ADR.]
- **One waiting feedback per card.** A second feedback while one waits **replaces** it (newer text wins) and the
  response says so; the person sees one queued feedback, never two.
- **Order:** feedback waits and fix waits are served together, oldest first, before any To Do card. A feedback counts
  as "waiting" for `BoardRunQueue` exactly like a fix wait (no To Do card starts while one waits).
- Cancelling: the person who can send feedback can cancel the waiting one; it is also dropped when its round starts,
  when the card leaves Finished, or when the card is accepted.

## Data / Schema
New table `board_feedback_waits` (migration `apps/api/prisma/migrations/20261231000055_board_feedback_waits`):

| Column | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `cardId` | FK → `board_cards.id`, **unique**, cascade delete | one per card |
| `projectId` | FK → `projects.id`, cascade delete | indexed with `createdAt` |
| `text` | text | the feedback, as `CardFeedbackDto.text` |
| `attachmentIds` | text[] | as today |
| `actorUserId` | FK → users | who sent it; the round runs as them |
| `createdAt` / `updatedAt` | timestamps | `createdAt` orders the queue; a replacement keeps the original `createdAt` |

## API
- `POST /projects/:id/board/cards/:n/feedback`: when `start` refuses `max_running`, upsert the wait and answer
  **`202`** `{ queued: true, place: <1-based among the project's waits>, card: BoardCardDetail }`. Other refusals
  (running, wrong column, budget) are unchanged.
- `DELETE /projects/:id/board/cards/:n/feedback-wait` — cancels it (`204`; `404` when none). Role: the same as
  feedback.
- `BoardCardDetail` gains `feedbackWait: { place, createdAt, byName } | null`.
- `BoardRunQueue`: `has()` also true when the project has a feedback wait; serving takes fix waits and feedback waits
  merged by time; a feedback wait calls `feedback(...)` as its stored actor; a `max_running` refusal leaves it in
  place; any other refusal (card left Finished, budget) deletes it and records an activity event so the person sees
  why.
- MCP `card_feedback`: outcome `queued` with the place; Telegram answers "Queued — starts when a worker is free
  (place N)".

## UI
- Card sheet, Finished card: after sending, the feedback box shows a quiet "Queued · starts when a worker is free ·
  place N" line with **Cancel**; while queued, Send replaces it ("Replace queued feedback"). glass-ui components only.
- The Board card face needs no new chip (C-392 thin face); the sheet carries it.

## Acceptance criteria
- [ ] e2e `board-feedback-waits.e2e.spec.ts`: with `maxRunning` reached, `POST …/feedback` answers `202 queued` and a
      row exists; when a running round ends, the feedback round starts **before** a queued To Do card.
- [ ] The same e2e: a second feedback replaces the first (one row, newer text, original `createdAt`).
- [ ] A wait survives an API restart (re-create the module in the test) and is served afterwards.
- [ ] Cancel removes it; accept or moving the card out of Finished removes it.
- [ ] A wait whose round is refused for a reason other than room is deleted and an activity event names the reason.
- [ ] MCP `card_feedback` returns outcome `queued` with the place (local handler test).
- [ ] Telegram feedback shows the queued answer (unit test of its text).
- [ ] Authorization: a viewer cannot cancel another person's queued feedback (`403`).
- [ ] DemoFlow demo `demoflow/cards/C-524-queue-feedback.demo.json` (sign-in fragment in `setup`): a Finished card,
      feedback sent while workers are full, the queued line, Cancel.
- [ ] ADR-0102 gets a short "Amended by C-524" note on feedback waits; `bun run check` passes.

## Risks
- Two writers of the run-queue serving path (C-418's `serveFixes`) — merge feedback waits into it rather than adding
  a second loop. Medium; covered by the ordering e2e.
- A waiting feedback starts long after the person wrote it; the sheet shows its age, and Cancel is one click. Low.

## Open questions
- Should a queued feedback also notify the person when it starts? Default: no — the round start is already on the
  card and in Activity.
