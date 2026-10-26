# C-442: Token saver filter families can be switched off per project

Stack **S-18 "Sessions, terminal and runner"**, stage 0. Issue **#669** (follow-up of #663 D9, ADR-0068 §2).

## Summary
The runner's filter already honours `NAUTELLE_FILTER_OFF` (comma-separated families), but nothing sets it: there is
no project setting, the launch never fills the variable, and the Token saver page has no switch. A family that does
not lower a project's cost per round cannot be turned off.

## Scope
**In:** `TokenSaverSettings` (schema + migration), `apps/api/src/token-saver/` (DTO, service, launch config),
`tokenSaverConfigSchema` in `packages/shared/src/token-saver/contracts.ts`, a runner capability,
`apps/runner/src/launch/token-saver.ts` (sets the env), the Token saver page
`apps/web/src/app/(app)/projects/[projectId]/token-saver/page.tsx` with a section component in
`apps/web/src/components/token-saver/`, a DemoFlow demo.
**Out:** per-card or per-type family switches; changing any filter rule.

## Current behaviour
- [Confirmed] `apps/runner/src/filter/env.ts:37-54`: `FILTER_OFF_ENV = 'NAUTELLE_FILTER_OFF'`, read by
  `filter/main.ts:89` and `filter/hook.ts:144` (`tool`, the Bash read refusal).
- [Confirmed] no code outside `filter/` names `FILTER_OFF_ENV`: the launch never sets it.
- [Confirmed] `apps/api/prisma/schema.prisma:4326-4344`: `TokenSaverSettings` has `enabled`, `mcpAllow`,
  `prefixBudgetTokens`, `mcpByType`, `skillsOffByType` — no family list.
- [Confirmed] `packages/shared/src/token-saver/contracts.ts:60-68`: `tokenSaverConfigSchema` is a `strictObject`
  (`enabled`, `mcpAllow`), so an older runner refuses a new key.
- [Confirmed] the families are the directories of `apps/runner/src/filter/families/` (`js`, `lang`, `ops`) plus
  `tool`.

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000045_token_saver_filters_off`: `token_saver_settings.filtersOff
TEXT[] NOT NULL DEFAULT '{}'`.

## Decisions
- D1. `TOKEN_SAVER_FILTER_FAMILIES = ['js', 'lang', 'ops', 'tool']` in `packages/shared`; a runner test pins it to
  the `families/` directories plus `tool`. *Source: #663 D9.*
- D2. `tokenSaverConfigSchema` gains optional `filtersOff` (a subset, no duplicates). The API sends it only to a
  runner that advertises `filterFamiliesOff`; an older runner gets the config without it. *Source: ADR-0010
  (typed, versioned commands).*
- D3. The launch sets `NAUTELLE_FILTER_OFF` to the list for every Token saver launch (card rounds, assess,
  capture, the orchestrator's sessions), and leaves it unset when the list is empty.
- D4. `PATCH` of the settings accepts `filtersOff`, with the same role check as the existing settings fields.

## UI
On the Token saver page, a **Filter families** section: one glass-ui `Toggle` per family, with that
family's saved tokens and cost per round beside it from the existing figures. A runner without the capability shows
a line that the switch takes effect after the runner update.

## Acceptance criteria
- [ ] Token saver e2e: `PATCH filtersOff: ['ops']` is stored and returned; an unknown family is `400`; a member without the settings role is
      `403`.
- [ ] A card launch on a runner with `filterFamiliesOff` carries `filtersOff`; one without the capability does not.
- [ ] `launch/token-saver.spec.ts`: the launch env has `NAUTELLE_FILTER_OFF=ops`; an empty list leaves it unset.
- [ ] `filter` e2e: an `ops` command under that env passes through as `none:off`.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-switch-filter-families-per-project.demo.json` (sign-in through
      `demoflow/fragments/sign-in.json` in `setup`): switch `ops` off, reload, it stays off.
- [ ] `bun run check` and the api, runner and web tests pass.

## Risks
- A family switched off raises token use for that project; the page shows the cost figures beside the switch so the
  effect is visible.

## Open questions
- None.
