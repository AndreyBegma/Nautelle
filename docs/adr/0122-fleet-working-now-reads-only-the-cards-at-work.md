# ADR-0122: Fleet's Working now reads only the cards at work

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-473-fleet-working-now-endpoint.md`](../specs/card-473-fleet-working-now-endpoint.md) ·
Amends: [ADR-0098](0098-one-work-model-cards-everywhere-fleet-shows-who-works-queue-shows-incoming-issues.md) §2 ·
Relates to: [ADR-0102](0102-run-at-the-agent-limit-queues-the-card-in-to-do-order.md) ·
Card: C-473

## Context

ADR-0098 §2 made the Fleet page's **Working now** list a derivation of
`GET /board`: the Board read model already carried rounds, tracking and
taken sessions, fleet slots and, since ADR-0102, run-queue places. It
rejected a server endpoint for the list.

Since then the Board read has become the heaviest read in the app (C-364).
It holds every column, every card face with its attachment count,
dependencies, stacks, review and demo facts, and a page of Completed cards.
The Fleet page fetched all of it on every `board.changed` and every `fleet`
push, only to keep the few cards someone works on. A project with hundreds
of cards paid for the whole Board to show three rows.

## Decision

1. **Working now has its own read.**
   `GET /projects/:projectId/fleet/working` (any member) answers
   `{ projectId, cards: BoardCardView[] }`: only the cards at work. Each card
   is mapped by the Board's own mapper (`toCardView` with the Board's facts),
   so a Working now row and its card face never disagree.
2. **"At work" is one shared predicate.** `isWorkingCard` in
   `packages/shared/src/board/working.ts` holds the four conditions as named
   parts:
   - an active round on the card's own worker (`worksOnOwnWorker`);
   - a live orchestrator slot, not gone, on a card that is not completed
     (`hasLiveSlot`);
   - a live tracked terminal session or a live session that took the card
     (`hasLiveSession`);
   - a To Do card's place in the run queue (`waitsInRunQueue`).

   A card in the Inbox is never at work, whoever asks. The API narrows the
   candidates in SQL by each part (an active-phase round, a slot not gone,
   a tracked session not ended, a queued or waiting queue entry in To Do),
   maps them, and keeps those that pass `isWorkingCard`. The web draws one
   row per part that holds, with the same parts.
3. **The page refreshes as before.** Working now refetches on `board.changed`
   and `fleet` pushes, debounced. The Fleet page no longer calls `GET /board`.
4. The Board page and `GET /board` do not change.

## Consequences

- The Fleet page's refetch costs a query over the cards at work and their
  facts, not the whole Board.
- Two definitions of "at work" could drift: the SQL narrowing and the
  predicate. The SQL is only a superset filter; the predicate decides. A web
  test checks that rows from the new read equal the rows the full Board gave
  for the same cards, and the API e2e test checks that the endpoint's cards
  equal the Board's cards that pass the predicate.
- A viewer never sees a captured card here: Inbox cards are left out for
  every role, which is stricter than the Board's own Inbox rule
  (`inbox-access.ts`) and matches what Working now showed before.
- Supersedes ADR-0098's rejection "A server endpoint for Working now": the
  Board read model still carries the facts, but reading all of it for a few
  rows is no longer cheap.
- Rejected:
  - **A `GET /board?only=working` flag.** It would give the Board's route a
    second response shape that only one page reads.
  - **Filter on the web only, with a smaller Board read.** The web would
    still download every card face to drop most of them.
