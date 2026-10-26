# C-508: Start an analysis from New work, Quick card, MCP and Telegram

Stack **S-23 "Analysis cards"**, stage 2. Needs C-503 and C-505.

## Summary
A person starts an analysis where they start any work: the Quick card's kind, a choice in New work, the MCP
`card_create` tool, and a Telegram `/analyze` command.

## Scope
**In:** `apps/web/src/components/board/quick-card-dialog.tsx`, `apps/web/src/components/board/new-card-dialog.tsx`,
`apps/runner/src/mcp/tools.ts` (`card_create` description), `apps/api/src/telegram/telegram-commands.ts` and its
handler.
**Out:** the sheet (C-507).

## Decisions
- D1. "We discussed it and made four cards to check something" — an analysis is started like any card —
  *the person, 2026-10-26 interview*.
- D2. Quick card: the Kind select gains **Analysis** ([Confirmed] kind field at
  `apps/web/src/components/board/quick-card-dialog.tsx:263-266`). The quick draft model never suggests it
  ([Confirmed] `apps/api/src/board-ai/board-quick-draft.service.ts:84` maps to feature|bug), so a person's pick
  is kept.
- D3. New work: the dialog is an intake interview that writes a card ([Confirmed]
  `new-card-dialog.tsx` header comment, #337 D2). It gains a two-option control under **What to do**:
  "Build" (today) and "Analyze — investigate, no pull request". Analyze skips the interview and creates an
  analysis card in To Do with the text as its body and a title the normalizer writes, then opens it.
- D4. MCP: `card_create` already takes `kind: LOCAL_CARD_KINDS` ([Confirmed] `apps/runner/src/mcp/tools.ts:302,317`),
  which C-503 extends; this card only updates the tool description to say what `analysis` does.
- D5. Telegram: `/analyze <what to check>` creates an analysis card in To Do of the chat's project and answers
  with its link ([Confirmed] commands list at `apps/api/src/telegram/telegram-commands.ts:11-20`). Without text
  it answers with usage.

## Acceptance criteria
- [ ] `quick-card-dialog` test: choosing Analysis creates a card with `kind: analysis`; the AI suggestion does
      not overwrite it.
- [ ] `new-card-dialog.test.tsx`: Analyze creates an analysis card without starting an intake turn.
- [ ] Telegram e2e: `/analyze check the slow board` creates an analysis card in To Do and replies with its link;
      `/analyze` alone replies with usage; `/help` lists it.
- [ ] MCP: `card_create` with `kind: analysis` creates one (runner tools spec).
- [ ] Only glass-ui components.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-start-an-analysis.demo.json` signs in through
      `demoflow/fragments/sign-in.json` in `setup`, creates an analysis from Quick card and from New work →
      Analyze, and shows both on the Board with the analysis icon.

## Open questions
- Should `/analyze` also start the Run? Default: no — it lands in To Do like any new card.
