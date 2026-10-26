# C-458: Record a demo for a bug card whose pull request changes UI

Stack **S-19 "Review steps and demo videos"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
Only feature cards get an automatic demo. A bug fix that changes a page — and many do — ships without a video, though
the person's rule is that every card that changes UI ends with a demo. This card drops the kind check: the PR's
changed files against `demoUiPaths` decide, for every card. It also records ADR-0121, the demo decisions of this
stack.

## Scope
**In**: the automatic trigger, the deferred log, the worker prompt wording, ADR-0121 and its README row.
**Out**: anything about how a demo is recorded.

## Current behaviour
- [Confirmed] `autoRecord` skips every non-feature card: "only a feature card records one" (`apps/api/src/demos/card-demos.service.ts:335-338`); `deferred` logs only for feature cards (`card-demos.service.ts:408-410`).
- [Confirmed] A bug card's round already gets the demo section and DemoFlow's MCP server when the project records demos: `cardRoundDemo` has no kind check (`apps/api/src/board/board-rounds.service.ts:285-296`).
- [Confirmed] The prompt says "This project records a demo of finished UI features" (`packages/shared/src/board/worker-prompt.ts:529-539`).

## Decisions
- **ADR-0121 (new, written in this card): "Every card that changes UI gets a demo; a base merge keeps it, a Completed card can still get one, and a broken scenario goes back to its worker"** (amends ADR-0095 §1 "a `feature` card" and "Bugs … get none", ADR-0095 §2, ADR-0090 "a failed demo is a warning, never a gate" for §4, ADR-0099 Consequences). Its sections:
  1. Any card kind gets an automatic demo when its PR touches `demoUiPaths` (this card). Source: the person's rule "every card that changes UI must end with a demo" (memory, 2026-10-26 plan).
  2. A head that only merges the base into a head with a demo keeps that demo; it is not superseded or recorded again (C-465).
  3. A demo can be recorded for a Completed card, on a detached checkout of its PR head (C-456, C-463).
  4. An automatic demo that fails on a scenario fault — a strict-mode or missing locator — starts a fix round for the card's worker, within the review fix budget (C-467).
  5. A PR file list that cannot be read is read again on later polls, up to three times, before the head is skipped (amends ADR-0095 §2; C-461).
- Prompt: "This project records a demo of every card that changes its UI." The rest of the section stays.

## Acceptance criteria
- [ ] A bug card whose green head touches a UI path gets one `auto` demo (`apps/api/src/board/board-demos.e2e.spec.ts`).
- [ ] A bug card whose PR touches no UI path gets none, and the no-UI log line is written once (same spec).
- [ ] The prompt text is updated and its spec (`packages/shared/src/board/worker-prompt.spec.ts`) checks the new line.
- [ ] ADR-0121 is in `docs/adr/` and listed in `docs/adr/README.md`.

## Risks
- A bug card whose worker wrote no scenario gets a `skipped` demo ("the card has no scenario", `apps/runner/src/demos/recorder.ts:311-317`) instead of none. That is visible and correct: it changed UI.

## Open questions
- None.
