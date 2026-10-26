# C-498: A Labels block in project Settings

Stack **S-22 "Card labels in colour"**, stage 1. Needs C-497 (the API). Follows the stack's shared design.

## Summary
Project Settings gets a **Labels** block where a project admin manages the project's card labels — rename, add, delete, recolour, reorder — the path rules that label a card from its pull request's files, the combinations ("frontend + backend → fullstack"), and two switches for the automatic labelling.

## Scope
**In**
- New block `labels` in the **Project** section of Settings, after General [sections at `apps/web/src/lib/projects/settings-sections.ts:6-48`, Confirmed; renderers at `apps/web/src/app/(app)/projects/[projectId]/settings/page.tsx:67-150`, Confirmed].
- New `apps/web/src/app/(app)/projects/[projectId]/settings/labels-tab.tsx`.
- Settings search keywords for the block (`apps/web/src/lib/projects/settings-search.ts`).

**Out**
- Showing labels on cards (C-499), the Work list (C-502), the API (C-497).

## Decisions
- D1. Labels, their rules and the switches are edited in project Settings by a project admin; everyone else sees them read-only. — the person, 2026-10-26 interview (Q13); C-497 API roles.
- D2. Colours are the eight glass-ui identity hues, chosen as swatches; no free colour input. — the person (Q13); ADR-0011; `docs/ui/glass-ui.md:23,36`.
- D3. glass-ui components only (ADR-0011): `Section`, `Input`, `Button`, `Badge hue` (`shape="square"` for a swatch), `Combobox multiple` (for `combines`), `Toggle`, `ConfirmDialog` — all in `@andrewbehma/glass-ui@0.38.0` [Confirmed `dist/primitives/badge.d.ts:118-127`, `dist/primitives/combobox.d.ts:55`]. If no glass-ui control can be a swatch radio group, a `HuePicker` is added to glass-ui first (own PR) — see Risks.

## UI
- **Labels list**: one row per label in `position` order — swatch, name (inline edit), the hue picker (eight swatches, the current one selected, each named "Blue", "Teal"… for screen readers), *Combines* (only shown when set, or behind "Combine labels…"), move up/down, Delete (confirm: "Removes *frontend* from N cards and its path rules"). **Add label** at the end: name + hue. Inline errors from the API (`label_name_taken`, `label_limit`, name format).
- **Path rules**: an ordered list of *pattern → label* rows (pattern `Input` with a `apps/web/**` placeholder, label `Select`), add / remove / reorder, one **Save rules** (the API replaces the list). A one-line hint: "When a card's pull request changes files that match, it gets the label. A label you set by hand is never changed."
- **Automatic labels**: two `Toggle`s — *Suggest labels for new cards with a model* (`labelSuggest`) and *Label cards from their pull request's files* (`labelPaths`). The first says when no LLM provider is configured that it needs one, linking to Admin › AI.
- Phone width (375): rows stack; nothing scrolls sideways.
- Light, dark and the navy palette use tokens only.

## Acceptance criteria
- [ ] Settings › Project › Labels lists the six starter labels with their colours on a fresh project.
- [ ] An admin renames a label, changes its colour, adds one, reorders, deletes one (with the confirm naming the card count), and saves path rules; a reload shows the changes.
- [ ] An operator and a viewer see the block read-only (no inputs, no buttons).
- [ ] `?tab=labels` opens the block; settings search finds it by "label", "colour", "path rule".
- [ ] Web unit tests: `settings-sections.test.ts` includes `labels`; `labels-tab.test.tsx` covers the admin and read-only renders and the API error messages.
- [ ] Screenshots in light, dark and phone width match the approved design.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-labels-block-in-project-settings.demo.json` (sign-in through `demoflow/fragments/sign-in.json` in `setup`, like `demoflow/cards/C-405-*.demo.json`) shows recolouring a label, adding one and adding a path rule.

## Risks
- glass-ui 0.38.0 has `RadioGroup` and `SegmentedControl` but neither is known to render a swatch option [Unknown]; if neither can, the hue picker goes to glass-ui first and this card waits for its release.

## Open questions
- Should a path rule be testable in place ("which labels would `apps/web/src/x.tsx` get?")? Default: no, out of scope.
