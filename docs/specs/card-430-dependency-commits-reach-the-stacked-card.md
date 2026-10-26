# C-430: New commits on a dependency's branch reach the stacked card

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 3. Part of the 2026-10-26 improvement plan.

## Summary
A card stacked on its dependency's branch (ADR-0064) keeps the dependency as it was when the card started. When the
dependency gets a fix round or feedback, the dependant's PR goes stale until its own next round, and "nothing is
automatic" (ADR-0064 Consequences; spec 636 Open questions). Now a dependency's push makes the stacked card merge it.

## Current state
- [Confirmed] ADR-0064 Consequences: "New commits on the dependency's branch reach the dependant only when its next
  round merges or rebases onto it; nothing is automatic."
- [Confirmed] A collect records the head it pushed (`apps/api/src/board/board-work.ts:2073-2080`,
  `recordRoundHead`); stacked cards carry `prBase`/`prBaseCardId`.
- [Confirmed] The conflict fix prompt already merges `origin/<base>` (`packages/shared/src/board/worker-prompt.ts:660-667`).

## Decisions
- Trigger: a dependency's collect pushed a new head. For each card with `prBaseCardId` = that dependency, In progress
  or Finished with an open PR, no active round and no `needsPerson`, start a `ci_fix` round with the new reason
  `base_moved {base}` (the person, 2026-10-26 interview).
- A `base_moved` round spends no fix budget (like conflicts after C-420, but uncapped: one per dependency push).
- A dependant that is running or needs a person is skipped and logged; its next round's prompt already starts from its
  branch, and a person can send feedback.
- Amends ADR-0064's consequence; noted there with a link to this spec. No new ADR.

## API
- `CardCiFixInput` gains `{reason: 'base_moved', base: string}`; `cardCiFixPrompt` words it as "the branch this PR is
  stacked on moved: merge `origin/<base>`, resolve, run the checks, commit, call finish_card."
- `board-work.ts`, after `recordRoundHead` of a card with dependants: emit `onDependencyMoved(cardId)`; the handler in
  `BoardRoundsService` starts the rounds (`ciFix` path, the dependant's own launch).

## Acceptance criteria
- [ ] e2e: a feedback round on dependency C-1 that pushes a commit starts a `ci_fix` (`base_moved`) round on stacked
      C-2, whose prompt names C-1's branch.
- [ ] e2e: a running C-2 is not interrupted; a C-2 that needs a person gets no round.
- [ ] e2e: `ciFixAttempts` of C-2 is unchanged.
- [ ] Unit (`worker-prompt.spec.ts`): the `base_moved` prompt.

## Risks
- Every dependency push costs one dependant round. A stack of five shows the cost; budgets still apply.

## Open questions
- Merge on the runner without an agent when it is clean? Default: no; a typed `card.syncBase` command can come later.
