# C-501: Refine a card's labels from its pull request's changed files by path rules

## Why
The files a pull request changes say better than any guess whether a card is frontend, backend or both. The person wants labels refined from them once the PR exists.

## What
- The runner reports `changedPaths` (sorted, at most 1 000) on each push and collect, from the same diff it already runs for protected paths.
- The API matches them against the project's path rules (`apps/web/**` → frontend, `apps/api/**` → backend, both → fullstack, `docs/**`, `deploy/**` / `.woodpecker/**`) and writes `paths` labels through `BoardLabels.applyAuto`: model guesses are replaced, a person's labels never.
- No match, an older runner or the switch off: nothing changes.

## Done when
- Unit tests of the matcher and combinations; e2e for replacing a model label, keeping a person's label and not re-adding a removed one; runner test for the field.

Evidence: apps/runner/src/git/protected-paths.ts:15-34; apps/api/src/board/board-sink.ts:227-262

Spec: docs/specs/card-501-label-a-card-from-its-pull-request-s-files.md
