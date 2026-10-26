# ADR-0125: Card labels belong to the project, and a person's label is the truth

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-497-card-labels-schema-api-and-starter-set.md`](../specs/card-497-card-labels-schema-api-and-starter-set.md) ·
Relates to: [ADR-0011](0011-glass-ui-is-the-component-library.md), [ADR-0024](0024-board-cards-and-dedicated-card-workers.md), [ADR-0059](0059-the-api-calls-llm-providers-directly-for-assistant-features.md) ·
Card: C-497 (stack S-22, stage 1)

## Context

The Board cannot group cards. A card's `kind` is only `feature` or `bug`, and
it says nothing about which part of the product the card touches. The person
asked for colour groups — frontend, backend, a redesign — that they can set by
hand and that Nautelle can also set by itself: a model guess when a card is
created, and evidence from the files a card's pull request changed.

Constraints:

- Projects differ: one repository has a web app and an API, another is a
  library. Labels that suit one project are noise in another.
- Colours must follow the theme (light, dark, glass). glass-ui defines a hue
  scale `--color-hue-1` … `--color-hue-8`; a stored hex colour would bypass it
  (ADR-0011, `docs/ui/glass-ui.md`).
- Automation must never undo a person: a label a person set must stay, and one
  a person removed must not come back on the next suggestion.
- The Board reads many cards at once; labels must not add a query per card.

## Decision

1. **Labels belong to the project.** `project_labels` holds a label's `name`,
   `hue`, `position` and `combines`. A name matches
   `^[a-z0-9][a-z0-9-]{0,31}$` and is unique in its project
   (`label_name_taken`, 409). A project has at most 30 labels; a card at most
   five (`label_limit`, 422). A label id of another project is
   `label_unknown` (422).
2. **The hue is a glass-ui hue number, 1 to 8.** No hex colour is stored, so a
   label's colour follows the theme.
3. **Every project starts with a starter set.** frontend (hue 1), backend (3),
   fullstack (2), redesign (8), infra (5) and docs (7), with path rules
   `apps/web/**` → frontend, `apps/api/**` → backend, `docs/**` → docs,
   `deploy/**` and `.woodpecker/**` → infra. The migration backfills it into
   every existing project; `ProjectsService` writes it into a new one
   (`writeStarterLabels`). There is no switch to turn it off: an admin deletes
   what the project does not need.
4. **A card-label row records who set it.** `board_card_labels` is one row per
   card and label with `source` (`person`, `model` or `paths`), `removed` and
   who set it. A person's `PUT …/cards/:number/labels` makes every listed label
   a `person` row and every shown label the list leaves out a `person` row
   with `removed`. A removal is a row, so it stays known.
5. **Automation writes through one service, and never a person row.**
   `BoardLabels.applyAuto(cardId, source, labelIds)` runs in one transaction
   and skips every label the card has a `person` row for, shown or removed. An
   empty set changes nothing. The card keeps at most five labels, the
   person's first.
6. **Path evidence replaces model guesses.** A `paths` write replaces the
   card's `model` rows and its earlier `paths` rows. A `model` write replaces
   only its own earlier rows, and is skipped once the card has `paths` rows.
7. **A combination stands for its parts.** `combines` lists the labels a label
   combines; when the path rules give all of them, the combined label replaces
   them. The starter fullstack combines frontend and backend, so a change to
   both apps reads as fullstack (applied by the path rules, C-501).
8. **The Board's cards carry their labels from one query.** `BoardCardView`
   gains `labels` (`id`, `name`, `hue`, `source`): the rows not removed, in
   label position order, read for every card of the Board in one query.
9. **Routes and events.** Under `projects/:projectId`: `GET labels` (viewer)
   returns the labels, the rules and the `suggest` and `paths` flags; `POST
   labels`, `PATCH`/`DELETE labels/:labelId` and `PUT labels/rules` are for a
   project admin; `PUT board/cards/:number/labels` and `labelIds` on `POST
   board/cards` for an operator. `PUT board-settings` takes `labelSuggest` and
   `labelPaths`. A person's changes are audited (`label.created`,
   `label.updated`, `label.deleted`, `label.rules_replaced`,
   `card.labels_changed`); automation's writes are not. A label or rule change
   publishes `labels.changed` on the project topic; a card whose labels change
   is published as any card change.
10. **The model's suggestion is a port.** `CardLabelSuggestRef` holds a
    suggester the way `FleetCardEditsRef` holds the fleet's port. After a card
    is created without the person's labels, and while `labelSuggest` is on,
    `BoardService.create` asks it without waiting. With nothing registered,
    nothing happens. The suggester itself (C-500) and the path rules on a
    pull request (C-501) are later stages.

## Consequences

- A person's removal is sticky: neither the model nor the path rules add the
  label back. Only the person can.
- Deleting a label removes it everywhere at once — from every card, every path
  rule and every other label's `combines` — and the remaining positions close
  up.
- Colours follow the theme, because only hue numbers are stored.
- GitHub issue and pull request labels stay separate; Nautelle neither reads
  nor writes them.
- The migration adds the `card_labels` value to `LlmFeature` for C-500's
  model call; nothing in this change uses it yet.

## Rejected alternatives

- **A free-text tag array on the card.** No colour, no rename, no order, and
  no way to tell a person's tag from a guess.
- **Workspace-wide labels.** Projects differ; one set for all of them would
  need per-project hiding and still mean different things in different
  repositories.
- **Hex colours.** They would bypass the glass-ui hue scale and break in dark
  and glass themes (ADR-0011, `docs/ui/glass-ui.md:23`).
