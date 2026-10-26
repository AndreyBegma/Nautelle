# C-463: Record a demo for a Completed card, and for any card that has none yet

Stack **S-19 "Review steps and demo videos"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
`POST …/cards/:n/demos` answers 409 `card_completed` for an accepted card, and the card sheet has no way to ask for
a first demo at all: the Demo section is drawn only once a demo exists. On 2026-10-26 DemoFlow card C-171 was accepted
before runner 0.18.0 could record it, and its video can no longer be made. With C-456's detached checkout, this card
lifts the refusal and adds a **Record demo** action to the sheet.

## Current behaviour
- [Confirmed] `request` refuses a Completed card with 409 `card_completed` (`apps/api/src/demos/card-demos.service.ts:231-237`).
- [Confirmed] It records the card's latest round and `ciHeadSha ?? latest.headSha` (`card-demos.service.ts:245-292`) and dispatches without a checkout (`card-demos.service.ts:661-692`).
- [Confirmed] The sheet draws `DemoSection` — and its **Record again** button — only when `card.demo` is set (`apps/web/src/components/board/card-sheet.tsx:1428-1441`, `apps/web/src/components/demos/demo-section.tsx:194-203`).

## Decisions
- ADR-0121 §3 (written by C-458). Source: the 2026-10-26 improvement plan (candidate 10).
- A Completed card with a pull request may be recorded. The demo records the head the PR last showed: `ciHeadSha`, else the latest round's `headSha`. `request` sends `checkout: { pr, headSha }` (C-456) for a Completed card only, since its worktree is gone; every other card records in its worktree as today.
- A Completed card on a runner without `cardDemoCheckout` is still refused, with 409 `demo_needs_checkout` and the message "The runner cannot record a completed card; update it".
- The other refusals stay: demos off, no pull request, never ran, one in flight.
- A Completed card's demo goes to Telegram and Slack as any ready demo does (`demoTelegram`, C-372).
- **Sheet.** An operator sees **Record demo** for a card with a pull request and no demo, in the sheet's overview where the Demo section goes; it calls `requestCardDemo` (`apps/web/src/lib/demos/actions.ts:54-56`) and the section appears with the queued demo. Built from glass-ui only (ADR-0011): `Section` and `Button`, as `DemoSection` uses. Nothing is shown with demo videos off.

## API
- `POST /projects/:projectId/cards/:n/demos` — no longer 409 `card_completed`; new 409 `demo_needs_checkout` (added to `DEMO_ERROR`, `packages/shared/src/demos/contracts.ts:242`).

## Acceptance criteria
- [ ] Record on a Completed card with a PR queues a demo and sends `card.demo` with `checkout` of `ciHeadSha` (`apps/api/src/demos/demos.e2e.spec.ts`).
- [ ] The same card on a runner without `cardDemoCheckout` answers 409 `demo_needs_checkout` (same spec).
- [ ] A viewer gets 403 and a member of another project 404, as for Record again (same spec).
- [ ] The sheet shows **Record demo** to an operator for a card with a PR and no demo, and not to a viewer (`apps/web/src/components/board/card-sheet.test.tsx` or the demo-section test).
- [ ] Ends with a recorded DemoFlow demo `demoflow/cards/C-<n>-record-demo-for-completed-card.demo.json`, signing in through `demoflow/fragments/sign-in.json` in `setup`, showing **Record demo** on a Completed card and the section appearing.

## Risks
- Recording an old head checks out code the project's current dev setup may no longer start. The demo then fails with DemoFlow's reason, which is visible.

## Open questions
- None.
