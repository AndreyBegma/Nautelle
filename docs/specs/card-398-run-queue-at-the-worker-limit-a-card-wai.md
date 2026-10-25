# C-398: Run queue: at the worker limit a card waits for a slot and starts in To Do order

Stack **S-15 "Core 3 — Fleet scale"**, stage *Fleet*, with C-399, C-400 and C-401.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- At the project's `maxRunning` limit (`packages/shared/src/board/card-rules.ts`), Run is refused.
- Auto-run stores the refusal on the card instead of queueing it
  (`apps/api/src/board/board-auto-run.ts`, header comment: "A refusal is not queued").
- Only stacks queue cards (ADR-0067, `apps/api/src/board/board-stack-runs.ts`).

## Decisions (grilling session)
- "Into the queue, in To Do order." Order is the priority, and reordering is by drag. There is no separate priority
  field.

## What
1. **Queue instead of refuse.** Run at the limit puts the card in a **Waiting for a slot** state.
2. **Start in order.** When a slot frees, the topmost waiting card in To Do order starts. Reordering To Do reorders
   the queue.
3. **One mechanism.** Stack queues (ADR-0067) and the new queue share it.
4. **Dependencies wait, not refuse.** A card whose dependency is not ready waits instead of being refused
   (ADR-0065 stays the gate).
5. **Visible state.** The waiting state shows on:
   - the card face (C-392);
   - the Board header, as a waiting count;
   - Fleet.
6. **Leaving the queue.** Stop removes a card from the queue.
7. **Other entry points.** Quick card's Run now (C-391) and Approve and run (C-394) use the queue.

## Out of scope
- A queue across projects. Every project keeps its own `maxRunning`.
- Priority fields.

## Touched areas
- `apps/api/src/board/board-auto-run.ts`, `apps/api/src/board/board-stack-runs.ts`, `apps/api/src/board/board.service.ts`
- `packages/shared/src/board/card-rules.ts`, `packages/shared/src/board/types.ts` (the new waiting state)
- `apps/api/prisma/schema.prisma` and a migration, if the queue needs a field (`prisma migrate dev`)
- `apps/web/src/components/board/board-view.tsx`, `apps/web/src/components/board/card-face.tsx`

## ADRs to read
- ADR-0065 (Run waits for every dependency to have a ready PR), ADR-0067 (Run stack queues within the agent limit),
  ADR-0076 (model and effort fixed per session).
- **A new ADR is needed**: Run queues at the limit instead of refusing, and it amends ADR-0067.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] Running 5 cards with 3 slots runs 3 of them. The other 2 start in To Do order as slots free.
- [ ] Reordering To Do changes the start order.
- [ ] Stop removes a card from the queue.
- [ ] A stack and loose cards share the slots in one order.
- [ ] The waiting count shows on the Board header and on Fleet.

## Tests
- e2e: ordering, reordering, stop, a stack mixed with loose cards, dependencies waiting.

## Open questions
- None.
