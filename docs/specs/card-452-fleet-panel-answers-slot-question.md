# C-452: The Fleet slot panel shows a slot's question and answers it

Stack **S-18 "Sessions, terminal and runner"**, stage 2. Needs C-446 (`pendingQuestion` on the slot view).

## Summary
With C-446 the slot view carries the question its pane shows. The slot panel's chat tab still offers only text.
This card shows the question with its options, like the card sheet, and sends an answer by option or "Other".

## Scope
**In:** `apps/web/src/app/(app)/projects/[projectId]/fleet/slot-panel/` (`chat-tab.tsx`, `slot-panel.tsx`), the
slot list's state label, tests, a DemoFlow demo.
**Out:** the API and runner (C-446); Telegram.

## Current behaviour
- [Confirmed] `apps/web/src/app/(app)/projects/[projectId]/fleet/slot-panel/chat-tab.tsx` sends text through
  `POST /projects/:id/slots/:slot/session-message`.
- [Confirmed] the card sheet already renders a pending question and its answers
  (`apps/web/src/components/board/card-sheet.tsx`, `apps/web/src/components/session/session-message-line.tsx`).
- [Confirmed] `packages/shared/src/session-message/contracts.ts:125-138`: `option` and `other` inputs carry the
  `questionKey`.

## Decisions
- D1. Reuse the card sheet's question block: move it into a shared component under
  `apps/web/src/components/session/` if it is not one already, and use it in both places. *Source: ADR-0011 (glass-ui
  only, no copy of markup).*
- D2. A slot with a question shows "Question" in the slot list, the same wording as a card face.
- D3. The outcome line under the composer uses `SESSION_MESSAGE_OUTCOME` as today.

## UI
In the chat tab, above the composer: the question header and text, one button per option, and an "Other" field when
the selector offers it. glass-ui only.

## Acceptance criteria
- [ ] Component test: a slot with `pendingQuestion` renders its options; pressing option 2 posts
      `{kind: 'option', questionKey, index: 2}`; "Other" posts `{kind: 'other', …}`.
- [ ] A slot without a question renders the chat tab as before.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-fleet-panel-answers-slot-question.demo.json` (sign-in through
      `demoflow/fragments/sign-in.json` in `setup`): a slot with a question, its options in the panel, an answer sent.
- [ ] `bun run check` and the web tests pass.

## Risks
- If the card sheet's block is moved, the card sheet's tests must still pass unchanged.

## Open questions
- None.
