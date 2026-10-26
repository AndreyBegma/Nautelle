# C-506: Create selected proposals as cards, then complete the analysis

Stack **S-23 "Analysis cards"**, stage 1. Needs C-503.

## Summary
Two routes on a finished analysis card: **Create selected** turns the ticked proposals into cards (To Do by
default, Inbox as an option) linked back to the analysis card, with the dependencies between them, and moves
the analysis card to Completed; **Complete without cards** dismisses every proposal and completes it.

## Scope
**In:** a new `apps/api/src/board/board-proposals.service.ts`, two routes in
`apps/api/src/board/board.controller.ts`, `BoardPlanCards` extended
(`apps/api/src/board/board-plan-cards.ts`).
**Out:** the UI (C-507).

## Decisions
- D1. The chosen cards go to To Do; Inbox is an option; the analysis card then goes to Completed by itself — no
  PR to merge, no demo — and created cards link back — *the person, 2026-10-26 interview (Q11)*.
- D2. Reuse `BoardPlanCards.create` ([Confirmed] `apps/api/src/board/board-plan-cards.ts:47-100`), which
  already makes cards from drafts with `[card, dependsOn]` links in the caller's transaction, and `announce`
  (audit, live event, assessment). Extend it: `planId` becomes optional, a draft carries `originCardId` and
  `labels`, the input carries `column: 'todo' | 'inbox'`. Proposal kinds map `feature → feature`,
  `bug → bug`, `task → task`.
- D3. Dependencies: a proposal's `dependsOn` becomes a card dependency only when both ends are selected; the
  others are dropped and the response lists them (`droppedLinks`).
- D4. Labels are applied through S-22's card labels when that stack has merged; until then they stay on the
  proposal only. *Default; see Open questions.*

## API
- `POST projects/:projectId/board/cards/:number/proposals/create` — `@ProjectRole('operator')`, like
  `POST board/cards` ([Confirmed] `apps/api/src/board/board.controller.ts:223-232`). DTO
  `{ positions: int[] (1–20, distinct), column: 'todo' | 'inbox', roundId: string }`. `roundId` is the round
  the person saw; another is `409 proposals_stale`.
  In one transaction under the card lock: the card must be `kind: analysis`, in Finished, with those
  positions `pending` in that round (else `409`); cards created; selected proposals `created` with
  `createdCardId`; the rest of the round's `pending` ones `dismissed`; `decidedById`, `decidedAt` set; the
  analysis card moved to Completed (`source: automatic`, `completedById` the person). Response
  `{ created: {number, title}[], droppedLinks: [position, dependsOn][] , card: BoardCardDetail }`.
- `POST projects/:projectId/board/cards/:number/proposals/dismiss` — same role; dismisses every `pending`
  proposal and completes the card. `204`.
- A `task` proposal while the project has no `task` kind (S-24 not merged) is refused per request with
  `422 kind_unavailable`.
- Audit: `card.proposals_created` (`{number, created: [n…]}`), `card.proposals_dismissed`.

## Acceptance criteria
- [ ] e2e: creating positions 0 and 2 (2 depends on 0) makes two To Do cards with `originCardId` set, a
      dependency 2 → 0, proposal 1 `dismissed`, and the analysis card in Completed.
- [ ] e2e: `column: 'inbox'` puts them in the Inbox column.
- [ ] e2e: a dependency on an unselected proposal is not created and is in `droppedLinks`.
- [ ] e2e: a repeated create with the same positions is `409` and creates nothing (idempotent).
- [ ] e2e: a stale `roundId` is `409 proposals_stale`; a non-analysis card or one not in Finished is `409`.
- [ ] Authorization e2e: a viewer of the project gets `403`; a user of another project gets `404`.
- [ ] e2e: dismiss completes the card and dismisses every pending proposal.
- [ ] The plan intake and split paths of `BoardPlanCards` are unchanged (existing specs pass).

## Risks
- `board.controller.ts` is shared by many cards; this card only adds two handlers.

## Open questions
- Labels before S-22 merges: Default — stored on the proposal, not applied; S-22's cards can backfill.
- Completed vs Finished after create: Default — Completed (D1).
