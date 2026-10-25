# ADR-0098: One work model — cards everywhere, Fleet shows who works, Queue shows incoming issues

Status: accepted · Date: 2026-10-25 ·
Spec: [`docs/specs/card-397-one-work-model-cards-everywhere-fleet-as.md`](../specs/card-397-one-work-model-cards-everywhere-fleet-as.md) ·
Amends: [ADR-0030](0030-terminal-work-and-fleet-work-appear-on-the-board.md) §4 ·
Relates to: [ADR-0024](0024-board-cards-and-dedicated-card-workers.md), [ADR-0037](0037-new-work-is-one-intake-that-can-split.md) ·
Card: C-397

## Context

Two systems create work and neither says which one is in charge:

- The Board says **New work** and makes a card
  ([ADR-0037](0037-new-work-is-one-intake-that-can-split.md)).
- Fleet, Queue and the project page say **New issue** and make a GitHub
  issue that a slot may pick up.
- A fleet card mirrored on the Board
  ([ADR-0030](0030-terminal-work-and-fleet-work-appear-on-the-board.md) §4)
  refuses every move but Accept with "A fleet card follows its slot", so a
  person who drags it learns that the Board is not theirs after all.

The person chose the Board as the one model. Nothing is deleted in this
step: every page and route stays, only their roles and entry points change.

## Decision

1. **One create action.** Every place that made work — the Fleet header,
   its quick actions, its empty state, the Queue header and empty state,
   the project page and the page-actions capsule — says **New work** and
   opens the Board's New work dialog (`?newWork=1`). The web New issue
   dialog is retired. The MCP `create_issue` tool and the runner's
   `issue.create` stay, for sessions that hand work to the fleet
   ([ADR-0051](0051-a-person-queues-what-a-session-files-for-the-fleet.md)).
2. **Fleet is the live view of who works.** Its header says so, and a
   **Working now** section lists every hand on the project with its state
   and a link to its card: card workers with an active round, orchestrator
   slots (fleet cards whose slot is live and not accepted), and sessions
   (a terminal session that tracks a card, or a session that took one).
   The list is derived on the web from `GET /board` and refreshed on
   `board.changed` and `fleet` pushes; no new endpoint. The slot table,
   agent tree and orchestrator controls stay below it.
3. **Queue is incoming work.** Its header says so, and an **Incoming**
   list shows the open GitHub issues — the labelled ones (the orchestrator's
   ready label) or all open ones — each with **Make a card**, or **Open card**
   once a card works it. Make a card is `POST /projects/:id/board/cards`
   with `issueNumber`: a To Do card titled after the issue, its body from
   the issue cache, linked to the issue so the card's pull request closes
   it (`issueOnRun` is off; the issue already exists). The queue read model
   fills `cardNumber` on each issue from the project's cards. The
   orchestrator's ready queue keeps working behind it, shown below the list.
4. **A fleet card moves like any card, and a move detaches it** (amends
   ADR-0030 §4). The `fleet_slot` refusal is removed from `boardMoveRule`
   and from bulk moves.
   - A person's move of a fleet card to any column but Completed sets
     `fleetDetached` on the card. From then on the slot mirror stops moving
     the card and stops deleting it when the issue leaves the queue; it
     still copies the slot's stage, pull request and "slot gone".
   - Accept (Finished → Completed) does not detach: it is the move ADR-0030
     already gave the person.
   - The slot is **not** told. There is no orchestrator command that means
     "this issue went back to To Do", and inventing one would put column
     semantics into the orchestrator
     ([ADR-0005](0005-drive-the-cs-orchestrator-skill-do-not-reimplement-it.md)).
     A person who wants the slot to stop uses the Fleet page, which controls
     slots.
   - A detached card still owns no card worker: it has no Run, Stop or
     Delete, as before. The face shows a **Detached** badge and the sheet
     says why.
5. **Naming.** **Work** is the cross-project list of cards; inside a project
   the List · Board toggle stays as it is.

## Consequences

- One button makes work everywhere, and it always makes a card.
- Dragging a fleet card never fails. The Board shows where the person put
  it; the Fleet page and the card's Fleet badge still show what the slot
  is doing, so the two may disagree until the person accepts the card.
- The orchestrator may still pick up a labelled issue that also has a card
  made from it. Make a card leaves the label alone; removing it is the
  person's choice on GitHub.
- Rejected:
  - **Tell the slot on a move.** No orchestrator control command carries
    column meaning, and a wrong guess (stop? re-plan?) costs a running slot.
  - **Keep refusing moves.** It is the confusion this decision removes.
  - **A server endpoint for Working now.** The Board read model already
    carries rounds, tracking, taken sessions and fleet slots.
  - **Delete the Fleet and Queue pages.** Out of scope for this step; their
    roles change first.
