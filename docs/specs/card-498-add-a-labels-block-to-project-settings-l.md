# C-498: Add a Labels block to project Settings: labels, colours, path rules, auto switches

## Why
Labels belong to the project and the person wants to rename, add, delete and recolour them, and to edit the path rules that set them automatically, in project Settings.

## What
- Settings › Project › Labels: the label list with name, colour swatches (the eight glass-ui hues), order, combinations and delete with a card count.
- Path rules: ordered pattern → label rows, saved together.
- Two switches: model suggestions on create, labels from pull request files.
- Read-only for anyone who is not a project admin.

## Done when
- An admin can do every edit and it survives a reload; others see it read-only.
- `?tab=labels` and settings search reach it.
- Light, dark and phone screenshots match the design; DemoFlow demo recorded.

Evidence: apps/web/src/lib/projects/settings-sections.ts:6-48

Spec: docs/specs/card-498-labels-block-in-project-settings.md
