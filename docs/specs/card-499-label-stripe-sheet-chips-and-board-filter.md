# C-499: Label stripe on the card face, label chips in the sheet, a label filter on the Board

Stack **S-22 "Card labels in colour"**, stage 1. Needs C-497 (`BoardCardView.labels`, `PUT …/cards/:n/labels`, `GET labels`). Follows the stack's shared design.

## Summary
A card's labels show on the Board as a **thin colour stripe on the card's left edge** — up to three segments, no names — so the face stays as thin as C-392 left it. The card sheet shows the labels as **editable chips**. The Board toolbar gets a **Label** filter.

## Scope
**In**
- `apps/web/src/components/board/label-stripe.tsx` (new, reused by the Work list in C-502), `card-face.tsx`, `card-sheet.tsx`, new `card-labels.tsx` (the sheet's editor), `board-toolbar.tsx`, `apps/web/src/lib/board/filter.ts`, the Board's refetch on `labels.changed`.
- `docs/ui/screens.md`: the Board row (stripe, filter) and the card sheet (chips).

**Out**
- Settings (C-498), the Work list (C-502), automation (C-500, C-501).

## Decisions
- D1. Face: a thin stripe on the left edge, up to 3 labels as equal segments, top to bottom in label `position` order; names are not on the face. More than three labels: the first three. — the person, 2026-10-26 interview (Q10).
- D2. The stripe is the card's edge, not a face signal: the C-392 rule "no tile shows more than four signals" [`docs/specs/card-392-thin-the-board-card-face-to-state-pr-ci.md`] still holds. — the person (Q10: "keep the thin face of C-392").
- D3. The sheet shows chips, editable by an operator; a viewer sees them read-only. — the person (Q10); the C-497 API role.
- D4. Editing in the sheet is the person's truth: whatever the person saves becomes `person` rows, including removals. — the person (Q14); ADR-0125.
- D5. glass-ui only (ADR-0011): segments are spans with `hueClasses(hue).dot` from `@andrewbehma/glass-ui/hue` [Confirmed `dist/lib/hue.d.ts:17-35` in 0.38.0] — an app composition of tokens, like `SelectedTint` [Confirmed `apps/web/src/components/board/selection-box.tsx:93-100`]; chips are `Badge hue label` [Confirmed `dist/primitives/badge.d.ts:118-121`]; the picker is `Combobox multiple` [Confirmed `dist/primitives/combobox.d.ts:55`]; the filter is a `Select` in the existing `Toolbar`.

## UI
- **Stripe**: positioned like `SelectedTint` (`absolute`, on the card surface's left edge, `-inset-y-[13px] -left-[13px]`, rounded on the left with the surface's radius), about 3 px wide, `aria-hidden`. Inside `CardFace` [Confirmed `apps/web/src/components/board/card-face.tsx:73-159`] it renders only when `card.labels` is not empty. The card's accessible text gets an `sr-only` "Labels: frontend, backend" in the header row (`card-face.tsx:85`). Selected tint and cursor outline still read on top of it.
- **Sheet chips**: a **Labels** row next to Kind [Kind field at `apps/web/src/components/board/card-sheet.tsx:1320-1335`, Confirmed]: one `Badge hue` per label; a label set automatically carries a small "auto" marker with a tooltip — "Suggested from the title" (`model`) or "From the pull request's files" (`paths`). An operator opens a `Combobox multiple` over the project's labels (swatch + name) and saving sends `PUT …/labels`. (The "Manage labels" link to Settings comes in C-502, after the Settings block exists.)
- **Filter**: a `Select` "Any label" + the project's labels, after Kind and before State [toolbar at `apps/web/src/components/board/board-toolbar.tsx:22-85`, Confirmed], in the URL as `?label=<name>`. `BoardFilter` gains `label` [Confirmed `apps/web/src/lib/board/filter.ts:20-27`]; a plan task is hidden by a label filter, as by kind. With search, Kind, Label and State the toolbar has three selects and a search — the `docs/ui/glass-ui.md:130` limit. Below `sm` it collapses as today.
- Light, dark and phone width use tokens only; the stripe is visible in all three.

## Acceptance criteria
- [ ] A card with frontend + backend shows a two-segment stripe (blue, green) and no label text; a card with four labels shows three segments; a card with none shows no stripe.
- [ ] A screen reader reads the card's labels; the stripe itself is hidden from it.
- [ ] An operator adds and removes labels in the sheet; after a reload they hold, and an auto label the operator removed does not come back (checked against C-497's rule).
- [ ] A viewer sees chips but no editor.
- [ ] `?label=frontend` shows only cards with that label; clearing the filter shows all; the filter survives a reload.
- [ ] Recolouring a label in Settings recolours the stripe on an open Board without a reload (`labels.changed`).
- [ ] Web unit tests: `card-face.test.tsx` (0, 2, 4 labels), `filter.test.ts` (label match, plan task hidden), `card-sheet.test.tsx` (chips, editor for operator only, auto marker).
- [ ] Screenshots in light, dark and phone width match the approved design; `docs/ui/screens.md` is updated.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-label-stripe-sheet-chips-and-board-filter.demo.json` (sign-in through `demoflow/fragments/sign-in.json` in `setup`) shows the stripes, editing labels in the sheet and filtering the Board by a label.

## Risks
- A 3 px stripe in a light hue may be faint on the light canvas; the design picks the width and whether the `dot` or `glow` class is used. If the stripe needs a variant glass-ui does not have, it goes to glass-ui first.

## Open questions
- Should the filter allow several labels? Default: one label, like Kind.
