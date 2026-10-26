# C-501: Label a card from its pull request's changed files

Stack **S-22 "Card labels in colour"**, stage 1. Needs C-497 (rules, `combines`, `BoardLabels.applyAuto`, `labelPaths`).

## Summary
Once a card has a pull request, its labels are refined from the files the branch changes, by the project's path rules (`apps/web/**` → frontend, `apps/api/**` → backend, both → fullstack, `docs/**` → docs, `deploy/**` or `.woodpecker/**` → infra). The runner reports the changed paths with each push and collect; the API matches them. A person's labels are never touched.

## Scope
**In**
- Runner: `apps/runner/src/git/protected-paths.ts` computes the branch's changed paths once and returns both the protected subset and the capped full list; `apps/runner/src/cards/git.ts` and `apps/runner/src/cards/executor.ts` put `changedPaths` on the push event and the collect result.
- Protocol: `changedPaths` on `cardRunPushedDataSchema` [Confirmed `packages/shared/src/protocol/events/cards.ts:108-135`] and on the collect result [Confirmed `packages/shared/src/protocol/commands/cards.ts:395-434`].
- API: `apps/api/src/board/board-label-paths.ts` (new: glob match + combinations, with `board-label-paths.spec.ts`), called from `apps/api/src/board/board-sink.ts` (push, `pushed` at `board-sink.ts:227-262`, Confirmed) and `apps/api/src/board/board-work.ts` (collect, next to `protectedPaths` at `board-work.ts:2091-2094`, Confirmed).

**Out**
- Re-labelling existing cards when the rules change (the next push applies them); the API reading the repository or GitHub's PR files (ADR-0001: the control plane never reads a project's filesystem — the runner reports).

## Decisions
- D1. "When the card's first PR exists, labels are refined from the PR's changed files by path rules"; automation never removes or overrides a person's label. — the person, 2026-10-26 interview (Q14).
- D2. Refinement runs on **every** push or collect that carries `changedPaths` while the card has a PR, not only the first one, so the labels follow the branch as it grows; it still changes only `model`/`paths` rows (ADR-0125, `applyAuto`). — this spec.
- D3. The runner already diffs the branch against `origin/<base>` for C-148 [Confirmed `apps/runner/src/git/protected-paths.ts:15-34`]; the same `git diff --name-only` feeds `changedPaths`, so no new git call. — ADR-0077 (as cited there), ADR-0001.
- D4. `changedPaths`: sorted, at most 1 000 entries (`CHANGED_PATHS_MAX`, shared), each ≤ 4 096 characters like `protectedPathsSchema` [Confirmed `packages/shared/src/protocol/branch-policy.ts:52-54`]. Absent from an older runner = unknown → no refinement. — this spec.
- D5. Matching: a path gets every label whose rule pattern matches (`**` any depth, `*` within a segment, `?` one character, no braces). The set is the union over paths; then each label whose `combines` are all in the set replaces them. No match → empty set → `applyAuto` changes nothing, so a model suggestion stays. — the person (Q14: "both → fullstack"); ADR-0125.
- D6. Off when the project's `labelPaths` is off. — C-497.

## Acceptance criteria
- [ ] Unit (`board-label-paths.spec.ts`): `apps/web/src/a.tsx` → frontend; `apps/web/x` + `apps/api/y` → fullstack only; `docs/a.md` + `apps/api/b.ts` → docs + backend; `.woodpecker/ci.yml` → infra; `README.md` → none; `apps/web` (no slash) does not match `apps/web/**`.
- [ ] e2e: a push with `changedPaths` on a card with a PR and a `model` label `docs` replaces it with `backend`; a `person` label `redesign` on the same card stays; a label the person removed is not added back.
- [ ] e2e: a push without `changedPaths` (older runner) and a push with `labelPaths` off change nothing.
- [ ] Runner unit test: the push event and the collect result carry `changedPaths` from the same diff as `protectedPaths`, capped at 1 000.
- [ ] `protectedPaths` behaviour is unchanged (the existing C-148 tests pass).

## Risks
- A branch with more than 1 000 changed files is matched on its first 1 000 paths (sorted), so a label may be missed. Acceptable for S–M cards.
- Needs a runner release before it works in practice; the API ignores the field's absence. The release is not part of this card.

## Open questions
- Should a label whose files leave the branch (e.g. reverted) be dropped? Default: yes — each push replaces the `paths` set, as D2 says.
