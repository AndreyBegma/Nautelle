# ADR-0103: The Inbox is one server read of what waits on the person

Status: accepted · Date: 2026-10-25 · Card: C-390 ·
Spec: [`docs/specs/card-390-inbox-one-page-for-everything-that-waits.md`](../specs/card-390-inbox-one-page-for-everything-that-waits.md) ·
Design: [`S-14 design 1`](../specs/stacks/S-14-core-2-daily-flow/design/1/screen.html) ·
Relates to [ADR-0094](0094-a-card-sessions-question-selector-is-reported-on-every-project.md),
[ADR-0096](0096-a-cards-demo-video-goes-to-telegram-as-a-notification-with-merge-and-feedback.md),
[ADR-0098](0098-one-work-model-cards-everywhere-fleet-shows-who-works-queue-shows-incoming-issues.md) and
[ADR-0100](0100-a-merged-card-completes-itself-and-needs-you-clears-itself.md)

## Context

What waits on a person was spread over five places: a card's question and its
design in the card sheet, a Finished card's merge on the Board, a tool-use
request in Approvals, a card that needs a person on its face, and a setup
blocker in Settings. Overview's "Needs you" listed some of them, assembled on
the web from five calls per project, and its count differed from what each
page showed. The person had to open every project to find the next decision.

## Decision

1. **One read model, `GET /inbox`.** The API returns every item that waits
   for a decision of the caller, across every project where they are operator
   or higher (an admin sees every project). It answers
   `{ items, counts, total, projects, missing }`; `total` is `items.length`,
   so the page, the rail badge, the bell and Overview's preview count the same
   items. The route writes nothing: every action goes to the route that
   already does it (session message, action-request decision, accept, card
   feedback, design approve / comment / revise, run, create pull request).
2. **The kinds and when an item exists.** The rules for board cards are the
   shared `inboxCardItems` (`packages/shared/src/inbox/items.ts`), so the web
   never re-derives them:
   - `question` — the card's round shows a question screen (ADR-0094);
   - `design` — the card's design is reviewing and nothing is approved;
   - `merge` — a Finished card at rest with an open, unmerged pull request,
     carrying its newest demo;
   - `failed` — not while a round is active: the card needs a person, its
     collect failed, its In progress round failed, or an automatic run was
     refused; `retry` says whether Retry runs or collects;
   - `permission` — a pending, unexpired tool-use request the caller may
     decide (`mayDecideActionRequest`);
   - `setup` — a readiness blocker of a project that has an open card; a
     project nobody works in waits on nobody.
   An item leaves the list as soon as its condition stops holding, whoever
   handled it. A merged card leaves because ADR-0100 completes it.
3. **What the Inbox leaves out.** Fleet cards, fleet merge approvals and slot
   prompts stay on Fleet and the Queue (ADR-0098): their worker is the
   orchestrator, and those pages already decide them. Failed orchestrator
   runs stay in Activity, and the Terminal → Board checklist stays in
   Settings. A project whose readiness cannot be read is named in `missing`
   and the rest still loads.
4. **The web reads it once, in the shell.** `InboxProvider` holds one
   `useSection` of `GET /inbox`, refreshed by the board, waiting, finished,
   design and action-request live events of every visible project, and by a
   60-second safety poll, since a runner going offline pushes nothing. A
   viewer has no Inbox entry and makes no call.
5. **The page groups by project, oldest first.** The spec asks for project
   groups; the S-14 design drew kind groups. The kind is a filter
   (`?kind=`) with a count per kind, next to a project filter
   (`?project=`). Each project group owns the card-action and
   request-decision hooks, which are per project.
6. **Overview's "Needs you" is a preview.** It shows the five oldest Inbox
   items and links to the Inbox; the per-project count on Overview's project
   cards is the Inbox's. Overview no longer reads failed runs, orchestrator
   settings or the terminal checklist for it.
7. **Deferred.** "Allow similar" on a tool-use request waits for the fleet
   stack's rule store. A merge has no Undo toast, since a merge cannot be
   undone. Telegram is unchanged.

## Consequences

- One request per shell load and per live event replaces Overview's per-project
  fan-out for what waits, and every surface agrees on the count.
- `GET /inbox` reads every visible project's open cards, designs, demos,
  pending requests and readiness on each call. It is bounded by open cards
  and by 50 pending requests per project.
- Fleet blockers and failed orchestrator runs are no longer on Overview; they
  are where they are decided, on Fleet and in Activity.
- Rejected: assembling the Inbox on the web from the existing routes. It
  would cost several calls per project on every live event, and the badge
  would need the same fan-out on every page.
- Rejected: a stored inbox table. Every item is already derivable from the
  rows it is about, and a copy would drift.
