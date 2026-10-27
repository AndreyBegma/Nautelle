# C-442: Let a project switch token saver filter families off

## Why
The filter honours `NAUTELLE_FILTER_OFF`, but no setting, launch or page sets it, so a family that does not lower a project's cost cannot be turned off (#669).

## What
- `token_saver_settings.filtersOff` (migration 20261231000045).
- The launch config carries it to runners that advertise `filterFamiliesOff`; the launch sets the env.
- A Filter families section with one toggle per family on the Token saver page.

## Done when
- E2e for PATCH, validation and roles; launch env test; filter passes an off family through; DemoFlow demo.

Evidence: #669; apps/runner/src/filter/env.ts:37-54; apps/api/prisma/schema.prisma:4326-4344.

Spec: docs/specs/card-442-switch-filter-families-per-project.md
