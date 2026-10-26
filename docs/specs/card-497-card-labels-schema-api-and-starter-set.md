# C-497: Card labels: schema, API and the starter set

Stack **S-22 "Card labels in colour"**, stage 0 (lead). Part of the 2026-10-26 improvement plan.

## Summary
Cards get **labels**: a name and an identity colour, owned by the project, to group cards visually (frontend, backend, redesign…). This card lays the foundation every other S-22 card builds on: the tables, the starter set, the REST API for the project's labels and path rules, the card's labels in the Board contracts, and one service through which automation writes labels without ever touching what a person set. It writes ADR-0125. No UI.

## Scope
**In**
- Prisma models, migration `apps/api/prisma/migrations/20261231000051_card_labels` (tables, enum, backfill of the starter set for every existing project, the `card_labels` LLM feature value).
- Shared contracts and limits in a new `packages/shared/src/board/labels.ts`.
- REST: the project's labels, path rules and label settings; set a card's labels; `labelIds` on create.
- `labels` on `BoardCardView` / `BoardCardDetail`.
- `BoardLabels` service (`apps/api/src/board/board-labels.service.ts`) with the automation entry point and a suggester ref (C-500 plugs into it).
- Starter set on project creation.
- `docs/adr/0125-card-labels-belong-to-the-project-and-a-person-s-label-is-the-truth.md`.

**Out**
- Every screen (C-498 Settings, C-499 Board, C-502 Work list), the model suggestion (C-500), path matching and the runner's changed paths (C-501), MCP and Telegram (C-502).
- Syncing with GitHub issue labels (the Queue's ready label is a different thing).
- Workspace-wide labels shared across projects.

## Decisions
- D1. Labels live in the **project**; every project starts with **frontend, backend, fullstack, redesign, infra, docs**. A project admin renames, adds, deletes and recolours them, and edits the path rules. — the person, 2026-10-26 interview (Q13).
- D2. A label's colour is one of glass-ui's eight identity hues (`Hue = 1…8`, `--color-hue-1`…`--color-hue-8`: blue, teal, green, amber, orange, red, violet, pink) [Confirmed `@andrewbehma/glass-ui@0.38.0` `dist/lib/hue.d.ts:4,16`]. Stored as the integer; never a hex value. — the person (Q13: "colours from glass-ui tokens"); ADR-0011; `docs/ui/glass-ui.md:23,36` (identity hues tell things apart, never a state).
- D3. Starter hues: frontend 1 (blue), backend 3 (green), fullstack 2 (teal), redesign 8 (pink), infra 5 (orange), docs 7 (violet). Amber (4) and red (6) are left out of the starter set because they sit next to `warn` / `danger` on a Board full of state colour; a person may still pick them. — this spec.
- D4. Labels are set **automatically and by hand**; automation never removes or overrides a label a person set, and a label a person removed is never added back by automation. Every card-label row records its source: `person`, `model`, `paths`. — the person (Q9, Q14).
- D5. Path evidence beats the model: once path rules have matched for a card, its `model` rows are replaced by the `paths` result; a model suggestion never replaces `paths` rows. — this spec, following Q14 ("refined from the PR's changed files").
- D6. "Both → fullstack" is a **combination**: a label may name the labels it combines (`combines`); when path rules yield all of them, the combined label replaces them. Starter: fullstack combines frontend + backend. — the person (Q14); replacement default in Open questions.
- D7. Names are lower-case kebab, `^[a-z0-9][a-z0-9-]{0,31}$`, unique per project, so MCP and Telegram can name them. — this spec.
- D8. Limits: 30 labels per project, 50 path rules per project, pattern ≤ 200 characters, 5 labels per card. — this spec.
- D9. Field name: the card already has `label` (`C-<n>`) [Confirmed `packages/shared/src/board/contracts.ts:205-206`]; the new array is `labels`. — this spec.

## Data / Schema
Today a card has `kind` + `kindSource` and nothing that groups it [Confirmed `apps/api/prisma/schema.prisma:3418-3436`].

```prisma
enum CardLabelSource { person model paths }

model ProjectLabel {
  id        String   @id @default(cuid())
  projectId String
  name      String   // D7
  hue       Int      // 1–8 (D2), checked by the DTO
  position  Int      // order in Settings, on the stripe and in chips
  combines  String[] @default([])  // label ids (D6); cleaned when a label is deleted
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  cards     BoardCardLabel[]
  rules     ProjectLabelPathRule[]
  @@unique([projectId, name])
}

model ProjectLabelPathRule {
  id        String @id @default(cuid())
  projectId String
  labelId   String
  pattern   String // glob: `*`, `**`, `?`; repository-relative, no leading `/`
  position  Int
  label     ProjectLabel @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@index([projectId])
}

model BoardCardLabel {
  cardId    String
  labelId   String
  source    CardLabelSource
  /// `person` only: the person removed it; automation leaves it off (D4).
  removed   Boolean  @default(false)
  setById   String?
  updatedAt DateTime @updatedAt
  card      BoardCard    @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label     ProjectLabel @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
}
```
- `BoardSettings` gains `labelSuggest Boolean @default(true)` and `labelPaths Boolean @default(true)` [model at `apps/api/prisma/schema.prisma:4064`].
- The migration also runs `ALTER TYPE "LlmFeature" ADD VALUE 'card_labels'` (as `20261231000036_llm_feature_quick_card` did) and inserts the starter labels, the starter rules (`apps/web/**` → frontend, `apps/api/**` → backend, `docs/**` → docs, `deploy/**` and `.woodpecker/**` → infra) and fullstack's `combines` for every existing project. Add `'card_labels'` to `LLM_FEATURES` [Confirmed `packages/shared/src/llm/providers.ts:58-69`].

## API
All under `projects/:projectId`; DTOs with `class-validator`.

| Method | Path | Role | Does |
|---|---|---|---|
| GET | `labels` | viewer | `{ labels: ProjectLabelView[], rules: LabelPathRuleView[], suggest, paths }` |
| POST | `labels` | admin | `{ name, hue }` → appended last |
| PATCH | `labels/:labelId` | admin | `{ name?, hue?, position?, combines? }` |
| DELETE | `labels/:labelId` | admin | removes it from every card and rule, and from other labels' `combines` |
| PUT | `labels/rules` | admin | `{ rules: [{ pattern, labelId }] }` replaces the ordered list |
| PATCH | `board/settings` (existing, `UpdateBoardSettingsRequest`, `contracts.ts:923`) | admin | gains `labelSuggest?`, `labelPaths?` |
| PUT | `board/cards/:number/labels` | operator | `{ labelIds }` — the person's truth: each listed label becomes `person`, each label now shown but not listed becomes `person` + `removed` |
| POST | `board/cards` (existing, `contracts.ts:785`) | operator | gains `labelIds?` (written as `person` rows) |

- Errors: `label_name_taken` 409, `label_unknown` 422 (an id not in the project), `label_limit` 422, `pattern_invalid` 422.
- `BoardCardView.labels: CardLabelView[]` = `{ id, name, hue, source }`, rows with `removed = false` only, in label `position` order. Mapped in `apps/api/src/board/board-mapper.ts` with the board query including the rows (no N+1).
- Every config change and every person label change is audited (`label.created|updated|deleted`, `label.rules_replaced`, `card.labels_changed`); automation writes are not audited — the row's `source` is the record.
- A live event `labels.changed` (shared constant) after a config change; card label changes go through `BoardWork.publish` like every card edit (`board.service.ts:627`).
- `BoardLabels.applyAuto(cardId, source: 'model' | 'paths', labelIds)`: in one transaction; never writes or deletes a `person` row; `model` is skipped when the card has `paths` rows; `paths` with a non-empty set deletes the other `model`/`paths` rows and upserts the set (D5); an empty set changes nothing; respects the 5-per-card cap; publishes the card when anything changed.
- `CardLabelSuggestRef` (the `FleetCardEditsRef` pattern, `board.module.ts:10`): `BoardService.create` [Confirmed `apps/api/src/board/board.service.ts:546-633`] calls `labels.afterCreate(card)` after the commit; it calls the registered suggester fire-and-forget only when `labelSuggest` is on and the request carried no `labelIds`. With nothing registered it does nothing.
- Starter set on create: `ProjectsService` writes it in the project's create [Confirmed `apps/api/src/projects/projects.service.ts:180-189`].

## ADR-0125 outline (the card worker writes the file)
Title: *Card labels belong to the project, and a person's label is the truth.*
- Context: no way to group cards; `kind` is feature/bug only; the person asked for colour groups set by hand and automatically.
- Decision: project-owned labels (name, glass-ui hue 1–8, position, combines); a starter set per project; card-label rows with `source` person/model/paths and `removed`; automation goes through one service that never writes a person row; path evidence replaces model guesses; combinations implement "both → fullstack"; names are kebab so tools can name them.
- Consequences: a person's removal is sticky; deleting a label removes it everywhere; colours follow the theme because only hue numbers are stored; GitHub labels stay separate.
- Alternatives rejected: a free-text tag array on the card (no colour, no rename); workspace-wide labels (projects differ); hex colours (ADR-0011, `docs/ui/glass-ui.md:23`).

## Acceptance criteria
- [ ] A new project, and every project that existed before the migration, has the six starter labels with the D3 hues, the five starter rules and fullstack combining frontend + backend.
- [ ] An admin can create, rename, recolour, reorder and delete a label and replace the rules; an operator and a viewer get 403 on each (e2e, `apps/api/src/board/board-labels.e2e.spec.ts`).
- [ ] A viewer of project A reads A's labels; a member of project B only gets 403/404 for A's labels and for `PUT …/cards/:n/labels` on A's card (authorization e2e).
- [ ] `PUT …/labels` with a label of another project is refused `label_unknown`; a sixth label on one card, or a 31st label in the project, is refused `label_limit`.
- [ ] Unit tests of `applyAuto`: never touches a `person` row; never re-adds a `removed` one; `model` after `paths` changes nothing; `paths` replaces `model`; empty set is a no-op.
- [ ] Deleting a label removes it from cards, rules and `combines`.
- [ ] `GET board` returns `labels` on each card with one query for all labels (checked with a query count in the e2e).
- [ ] `docs/adr/0125-…md` exists and `docs/adr/README.md` lists it; `bun run check` passes.

## Risks
- `ALTER TYPE … ADD VALUE` in the same migration as the inserts: the new value must not be used by those inserts (it is not).
- Every web fixture that builds a `BoardCardView` needs `labels: []` (`apps/web/src/lib/board/fixtures.ts`) — this card updates them so the type check passes.
- The starter rules fit this monorepo's layout; in another repository they match nothing, which is harmless.

## Open questions
- Does a combination **replace** its parts (fullstack instead of frontend + backend) or add to them? Default: replace — one segment instead of two on the face.
- Should a project admin be able to turn the starter set off for new projects? Default: no; deleting the labels is enough.
