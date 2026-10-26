# C-493: A design waiting for approval notifies the people who can approve it

Stack **S-20**, stage 2: after C-490, which also adds a kind to `kinds.ts` and the format maps.

## Summary
When a card's design finishes generating, it waits in `reviewing` for a person to approve a variant. The Inbox lists it (C-390), but nothing tells anyone: no notification kind starts with `design.`. A design that waits is a card that does not move.

## Scope
**In:** a new kind `design.waiting`, written when a card's design enters `reviewing`.
**Out:** stack designs (a later card if wanted), and approving from Telegram.

## Current behaviour
- [Confirmed] `apps/api/src/design/design-apply.ts:131` sets `status: 'reviewing'` when the last variant lands.
- [Confirmed] The Inbox reads designs in `reviewing` (`apps/api/src/inbox/inbox.service.ts:133,141-142`).
- [Confirmed] `packages/shared/src/notifications/kinds.ts:36-61` has no `design.*` kind. `card.waiting` is the closest: scope `project`, defaults in-app on and Telegram off, `ownerEmail: 'immediate'` (`kinds.ts:214-220`). `operatorsOnly` exists for kinds only operators can act on (`kinds.ts:99-104`).

## Decisions
- Kind `design.waiting`, scope `project`, `operatorsOnly` (a viewer cannot approve). Its defaults and `ownerEmail: 'immediate'` are the same as `card.waiting`'s. The candidate said "its creator". Everyone who may approve is the rule the other waiting kinds follow, and the creator is one of them; `ownerEmail` also sends the creator the immediate email. (The person, 2026-10-26 interview: consistency with `card.waiting`.)
- Title "Design for C-<n> waits for your approval"; link `/projects/:id/board?card=<n>&tab=design`. [Unknown] the exact design tab param; the card uses the one the card sheet reads.
- It is written once per design generation. A revise that returns to `reviewing` notifies again, which is right: it waits again.
- It is written in the transaction that sets `reviewing`, through `NotificationWriter.write` with the project's recipients.

## Acceptance criteria
- [ ] `apps/api/src/design/card-design.e2e.spec.ts`: the last variant landing writes one `design.waiting` per operator and admin member, and none to viewers or non-members (authorization).
- [ ] A revise that returns to `reviewing` writes a second one. A failed generation writes none.
- [ ] Account › Notifications lists "Design waits for approval". The web and email `Record<NotificationKind>` maps have the kind.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-design-waiting-notifies.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the bell item for a seeded design and opens the card's design.

## Risks
- None worth naming.

## Open questions
- Post it to Slack as `question`? Default: no. Slack's events are settled in ADR-0109 §3, and C-494 decides any additions.
