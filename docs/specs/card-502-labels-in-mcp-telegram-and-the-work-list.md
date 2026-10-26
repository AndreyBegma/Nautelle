# C-502: Card labels in MCP tools, Telegram and the Work list

Stack **S-22 "Card labels in colour"**, stage 2. Needs C-497 (labels on cards, `labelIds` on create), C-498 (the Settings block) and C-499 (`label-stripe.tsx`, `card-labels.tsx`). Follows the stack's shared design.

## Summary
Labels reach every other place a card is read or made: the session MCP tools (`card_create` takes labels by name, `board_list` and `board_card` return them), the Telegram card text, and the Work list, which shows the same left-edge stripe as the Board.

## Scope
**In**
- MCP contract: `packages/shared/src/protocol/local.ts` — `labels` on `localCardCreateArgsSchema` [Confirmed `local.ts:420-432`] and on the list card and card detail schemas [list card type at `local.ts:620`, Confirmed]; tool descriptions in `apps/runner/src/mcp/tools.ts` [Confirmed `tools.ts:249-321`].
- API: `apps/api/src/board/board-session.service.ts` — `localListCardOf` [Confirmed `board-session.service.ts:66-80`], `card`, `create` (names → ids, then `BoardService.create` with `labelIds`).
- Telegram: `cardText` [Confirmed `apps/api/src/telegram/board-actions.ts:247-276`].
- Work list: `WorkCardItem` [Confirmed `packages/shared/src/work/contracts.ts:85`], `apps/api/src/work/work-query.service.ts` [card rows at `work-query.service.ts:160-192`, Confirmed], `apps/web/src/components/work/work-table.tsx` (desktop row and phone row).
- The card sheet's Labels row gets a **Manage labels** link to Settings › Labels (`settingsItemHref('labels')`, C-395), now that C-498's block exists (`apps/web/src/components/board/card-labels.tsx`).
- `docs/ui/screens.md`: the Work row; `plugins/nautelle/skills/board/SKILL.md` mentions labels on `card_create`.

**Out**
- Editing labels from MCP after create, or from Telegram (the sheet does that); a label filter on the Work list.

## Decisions
- D1. "Also expose labels in MCP card_create / board_list / board_card, and Telegram card text." "Work list shows the stripe too." — the person, 2026-10-26 interview (Q10).
- D2. Tools name labels, not ids: `labels: string[]` of project label names (C-497 D7 makes them kebab). An unknown name is refused `label_unknown` with the project's names in the message, so the session can retry. — this spec.
- D3. A label given to `card_create` is a person's choice (the session acts for the person) and stops the model suggestion (C-500 D4). — the person (Q14: a manual label is the truth).
- D4. The read tools return `labels: [{ name, source }]`; Telegram prints `Labels: frontend, backend` after the Kind line, nothing when there are none; colours are not sent anywhere outside the web app. — this spec.
- D5. The Work list reuses `LabelStripe` from C-499 on the row's left edge; the names are in the row's accessible text, not shown. — the person (Q10); ADR-0011.

## Acceptance criteria
- [ ] `card_create` with `labels: ["frontend"]` creates the card with `frontend` as a `person` label and no model call; `labels: ["nope"]` is refused `label_unknown` listing the names (API e2e in `apps/api/src/board/board-session.e2e.spec.ts`).
- [ ] `board_list` and `board_card` return each card's labels with their source; a viewer-role session sees them (it may read the Board), and a session of another project cannot read them (authorization case in the same e2e).
- [ ] The Telegram card text of a labelled card has the Labels line; an unlabelled card's text is unchanged (`apps/api/src/telegram/board-actions.spec.ts`).
- [ ] The Work list shows the stripe on a labelled card's row at desktop and phone width; plan-task and fleet rows without labels show none (`work-table` unit test).
- [ ] The sheet's Manage labels link opens Settings › Project › Labels.
- [ ] `apps/runner/src/mcp/tools.spec.ts` covers the new `labels` input.
- [ ] Screenshots in light, dark and phone width match the approved design.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-labels-in-mcp-telegram-and-the-work-list.demo.json` (sign-in through `demoflow/fragments/sign-in.json` in `setup`) shows the Work list with labelled cards.

## Risks
- The MCP tools ship with the runner; until a new runner is out, sessions keep the old `card_create` input. The API accepts an absent `labels`.

## Open questions
- Should `board_list` take a label filter? Default: no; a session filters the list itself.
