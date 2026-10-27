# C-456: Let the runner record a demo on a detached checkout of a PR head

## Why
The runner records only in the card's worktree, which is gone once a card is Completed. C-171 was accepted before runner 0.18.0 could record it and its video can no longer be made.

## What
- `card.demo` gains optional `checkout: { pr, headSha }`; capability `cardDemoCheckout`.
- With it, the runner fetches the head, records in `.wt-<repo>-demo-<shortId>` detached there, and removes it after.
- `demo-` joins NON_SLOT_WORKTREE.

## Done when
- Recorder spec: records from the detached worktree and removes it, also on failure; unfetchable head fails with a clear reason.
- Capability advertised.

Evidence: apps/runner/src/demos/recorder.ts:303-310, packages/shared/src/protocol/commands/demos.ts:36-52

Spec: docs/specs/card-456-runner-records-demo-on-detached-checkout.md
