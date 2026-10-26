# C-457: Tell whether a PR head only merges the base into an earlier head

Stack **S-19 "Review steps and demo videos"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
When the base branch is merged into a card's PR ("Update branch" on GitHub, or a person), the PR gets a new head.
Today the review steps run again and a new demo is recorded for it, though the card's own change did not move. Both
later cards (C-462 review, C-465 demo) need one fact: *does head B only merge the base into head A, cleanly?*
The API cannot read git (ADR-0001), so the runner answers it with a new typed read, and the API keeps each answer.

## Scope
**In**: `card.headDelta` (shared contract and runner), `BoardCommands.headDelta`, an API service that asks once per
head pair and stores the answer, migration `apps/api/prisma/migrations/20261231000046_card_head_carries`.
**Out**: using the answer (C-462, C-465).

## Current behaviour
- [Confirmed] The review gate looks up runs by exact `headSha` (`apps/api/src/board/board-review.ts:212-221`), so any new head runs every step again.
- [Confirmed] Every new open head supersedes a demo of an older head (`apps/api/src/board/board-shipping.ts:597-600`, `apps/api/src/demos/card-demos.service.ts:428-446`).
- [Confirmed] No runner command compares two heads; the card commands are listed in `packages/shared/src/protocol/commands.ts:169-196`.

## Decisions
- ADR-0120 §6 and ADR-0121 §2 rest on this fact. Source: the 2026-10-26 improvement plan (candidate 5); spec 884 Open questions; ADR-0099 Consequences ("records up to four heads").
- **Definition.** `to` is a base merge of `from` when `to` has exactly two parents, one of them is `from`, the other is an ancestor of `origin/<base>`, and `to`'s tree equals the tree `git merge-tree --write-tree from <other parent>` produces. A merge with a conflict resolved by hand, or any extra edit, is not one.
- The runner fetches `from`, `to` and `base` from origin first. A commit it cannot fetch, or a git older than `merge-tree --write-tree` (2.38), answers `baseMerge: false` with the reason; the caller then treats the head as new, as today.
- The API stores answers in `card_head_carries` and asks the runner at most once per `(cardId, fromSha, toSha)`. A runner that does not advertise `card.headDelta`, or no answer, is "not a base merge" and is not stored, so it is asked again.

## Data / Schema
Migration `20261231000046_card_head_carries`:
```prisma
model CardHeadCarry {
  id        String   @id @default(cuid())
  cardId    String
  fromSha   String
  toSha     String
  /// `toSha` only merges the base into `fromSha`, cleanly.
  baseMerge Boolean
  /// Why it is not one: not_a_merge, parent_mismatch, not_on_base, tree_differs, unknown_commit, git_too_old.
  reason    String?
  createdAt DateTime @default(now())
  card BoardCard @relation(fields: [cardId], references: [id], onDelete: Cascade)
  @@unique([cardId, fromSha, toSha])
  @@map("card_head_carries")
}
```

## API (runner protocol and service)
- `card.headDelta` — args `{ cardId, projectId, root, from: headSha, to: headSha, base: gitRef }`; result
  `{ baseMerge: true } | { baseMerge: false, reason: <one of the reasons above> }`. Operator role. Read-only on the
  repository: no checkout, no worktree.
- `BoardHeadCarry.isBaseMerge(project, card, from, to): Promise<boolean>` in `apps/api/src/board/board-head-carry.ts`, registered in `board.module.ts`.

## Acceptance criteria
- [ ] Runner spec on a real temporary repository: a clean `git merge origin/base` head answers `baseMerge: true`; a merge with a hand-edited conflict, a normal commit, and a merge of a non-base branch each answer `false` with the right reason (`apps/runner/src/cards/head-delta.spec.ts`).
- [ ] The API asks the runner once for a pair and answers later calls from `card_head_carries` (`apps/api/src/board/board-head-carry.e2e.spec.ts` or a unit spec with the Board e2e world).
- [ ] A runner without `card.headDelta` gives `false` and stores nothing (same spec).
- [ ] The Board e2e world answers `card.headDelta` (`apps/api/src/board/testing/board-e2e.ts`).
- [ ] The migration applies on a fresh database and on develop's (`bun run check`, api e2e).

## Risks
- `merge-tree --write-tree` needs git 2.38 or later on the runner machine; older git only loses the saving.

## Open questions
- Should a base merge with conflicts resolved by GitHub's own UI count? Default: no — a hand resolution is a change.
