# C-390: Inbox: one page for everything that waits on you, across projects, with the action right there

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
What needs a person is split across the bell, each project's Queue → Approvals tab (`queue/page.tsx`), card sheets ("The agent asks you", `card-sheet.tsx:1105`) and the Fleet slot chat. There is no single place.

## What
- A workspace page **Inbox** in the rail, with a count badge; the bell links to it. Phone: in the capsule.
- Items, across every project the user can see, only what waits for a decision:
  - a card session's question → its options as buttons, or free text;
  - a tool-use request (away mode) → Allow / Deny (+ the "allow similar" rule from the fleet stack once it lands);
  - a Finished card ready to merge → demo video inline, CI, PR, Merge / Feedback;
  - a design waiting for approval → preview, Approve, Approve and run, Back with comment;
  - a card that needs a person (CI fix rounds exhausted, collect failed) → Retry / Open;
  - a setup blocker (no runtime profile, runner offline, push not possible) → the fix link.
- An item disappears when handled or no longer applicable. Grouping by project, oldest first, filters by kind.
- Overview's "Needs you" block becomes a short preview of the Inbox.
- Telegram keeps working as today.

## Done when
Every kind above can be handled without leaving the Inbox, the count matches, and handling it on another surface removes it live.

Spec: docs/specs/card-390-inbox-one-page-for-everything-that-waits.md (PR #937)
