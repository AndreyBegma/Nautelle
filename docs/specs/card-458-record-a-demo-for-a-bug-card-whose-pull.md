# C-458: Record a demo for a bug card whose pull request changes UI

## Why
Only feature cards get an automatic demo. The rule is that every card that changes UI ends with a demo.

## What
- Drop the kind check: the PR's files against demoUiPaths decide for every card.
- Prompt: "records a demo of every card that changes its UI".
- Write ADR-0121 (any UI card gets a demo; base merges keep it; Completed cards can be recorded; scenario faults go back to the worker; a failed PR file read is retried).

## Done when
- A bug card touching a UI path gets one auto demo; one touching none gets none.
- ADR-0121 listed in docs/adr/README.md.

Evidence: apps/api/src/demos/card-demos.service.ts:335-338, 408-410

Spec: docs/specs/card-458-bug-cards-that-change-ui-get-a-demo.md
