# C-446: Fleet slots report their question selector, like card sessions

Stack **S-18 "Sessions, terminal and runner"**, stage 1 (after C-442, which also edits `schema.prisma`). New **ADR-0117**. The Fleet page shows and answers it in
C-452.

## Summary
A card session's `AskUserQuestion` selector is reported to the Board on every project (ADR-0094), so the person sees
the question and answers it from the card, Telegram or MCP. A fleet slot's selector is not reported at all: the
slot shows only `prompt`, and the person has to open the terminal. The answer path for slots already exists.

## Scope
**In:** the runner's tmux collector (`apps/runner/src/collectors/tmux/`), a `pane.question` event in
`packages/shared/src/protocol/events/fleet.ts`, `Slot.pendingQuestion` (schema + migration), the slot projection in
`apps/api/src/fleet/` (`slot-patch.ts`, `slot-projection.ts`), the slot view in `packages/shared/src/fleet/contracts.ts`,
ADR-0117, tests.
**Out:** the Fleet page (C-452); Telegram buttons for slots (Open question); the orchestrator's own pane.

## Current behaviour
- [Confirmed] `docs/adr/0094-a-card-sessions-question-selector-is-reported-on-every-project.md` Consequences:
  "Fleet slots still do not report their question selector (ADR-0045)."
- [Confirmed] `apps/runner/src/collectors/tmux/tracker.ts:7-12`: a slot pane's changes are `pane.prompt`,
  `pane.idle`, `pane.quota_*`, `pane.busy` — no question.
- [Confirmed] `apps/runner/src/cards/executor.ts:1266-1296`: a card's pane is read with `readQuestion`
  (`apps/runner/src/cards/question.ts:182`) and reported as `card_run.pending_question`, redacted and capped.
- [Confirmed] `apps/runner/src/session/messenger.ts:97-115,150-162` and
  `apps/api/src/control/slot-session-message.service.ts`: a slot already takes `option` and `other` answers with a
  `questionKey`.
- [Confirmed] `apps/api/prisma/schema.prisma:782-833`: `Slot` has `pane` and quota fields, no question.

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000044_slot_pending_question`: `slots.pendingQuestion JSONB NULL`
(shared `pendingQuestionSchema`).

## Decisions
- D1. **ADR-0117**: a fleet slot's question selector is reported on every project, redacted and capped exactly as
  ADR-0094 §2 does for card rounds. It amends ADR-0045 §4 and closes the ADR-0094 consequence. *Source: ADR-0094
  (the same reasoning: a selector addresses the person).*
- D2. The collector runs `readQuestion` on each slot pane it already captures and emits
  `pane.question {target: 'slot', question: PendingQuestion | null}` when the key changes, null when the selector
  goes — the same de-duplication as `noticePendingQuestion`.
- D3. The API stores it on the slot and clears it on `pane.busy`, `pane.idle` and slot end. The slot view gains
  `pendingQuestion` (optional, additive).
- D4. No capability is needed: an older runner never sends `pane.question`, and the slot view stays as today.

## Acceptance criteria
- [ ] Collector test on captured panes: a slot pane with a selector emits one `pane.question`; the same screen on
      the next poll emits nothing; the selector gone emits `question: null`.
- [ ] The question text and options pass through `redactText` and the ADR-0094 caps (test with a token in an
      option).
- [ ] Fleet e2e: the event sets `pendingQuestion` on the slot view; `pane.busy` clears it.
- [ ] Authorization e2e: a member of another project cannot read the slot's question.
- [ ] `bun run check` and the api and runner tests pass.

## Risks
- Same caveat as ADR-0094: redaction is pattern-based. Recorded in ADR-0117.

## Open questions
- Should a slot's question also reach Telegram with buttons? Default: no — a later card; this one feeds the Fleet
  page.
