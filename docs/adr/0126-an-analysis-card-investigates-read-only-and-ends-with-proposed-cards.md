# ADR-0126: An analysis card investigates read-only and ends with proposed cards

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-503-analysis-kind-and-finish-analysis-contract.md`](../specs/card-503-analysis-kind-and-finish-analysis-contract.md) ·
Relates to: [ADR-0010](0010-typed-command-allowlist-on-the-runner.md), [ADR-0024](0024-board-cards-and-dedicated-card-workers.md), [ADR-0035](0035-a-card-ships-itself.md), [ADR-0084](0084-a-card-passes-its-review-steps-before-finished.md), [ADR-0090](0090-a-finished-card-may-carry-a-demo-video-recorded-by-demoflow-on-the-runner.md), [ADR-0125](0125-card-labels-belong-to-the-project-and-a-person-s-label-is-the-truth.md) ·
Card: C-503 (stack S-23, stage 1)

## Context

Some work asks to check something, not to change it: why the fleet page is
slow, what an upgrade would break, which modules have no tests. On the Board
today every card is a `feature` or a `bug`. Its worker branches, commits, and
the card ends in a pull request that then goes through collect, CI, the review
steps (ADR-0084) and a demo (ADR-0090). An investigation does not fit that
path. It produces nothing to push, its result is a written report, and the
follow-up work it finds should become new cards that a person chooses.

Constraints:

- The worker must not change the repository. Being told "do not edit" in a
  prompt is not enough; the runner has to enforce it (ADR-0010).
- What the worker proposes is advice. A person decides which proposals become
  cards, and that decision must survive a later feedback round.
- The kind is the person's choice. The model classifies work as `feature` or
  `bug`. It should never decide on its own that a request means "investigate
  only".

## Decision

1. **A third card kind, `analysis`.** It is in `BoardCardKind`,
   `BOARD_CARD_KINDS` and `LOCAL_CARD_KINDS`. `WORK_CARD_KINDS` (`feature`,
   `bug`) is the set a model may pick, and the normalizer, capture,
   quick-draft, triage, the assistant's tools and `track_card` use it. An
   analysis card's `kindSource` is always `person`.
2. **Its rounds are read-only.** `card.run` gains `readOnly: true`. It excludes
   `pullRequest`, `newBranch`, `startBranch` and `demo`. A runner that enforces
   it advertises `cardReadOnly` (`cardReadOnlyAvailable`). The launch itself is
   C-504; the gating of the run and the prompt is C-505.
3. **It finishes with `finish_analysis`, not `finish_card`.** The local method
   `card.finishAnalysis` (operator, needs a project) takes a `report` of up to
   20 000 characters and up to 20 `proposals`. Each proposal has a `title`, a
   `body`, a `kind` (`feature`, `bug` or `task`), up to five `labels` and a
   `dependsOn` that names only earlier positions. In one transaction it:
   - stores the report on the active round, with the report's first paragraph
     as the round's summary;
   - replaces the card's `pending` proposals, keeping the `created` and
     `dismissed` ones as the person's decisions;
   - ends the round as finished by the worker;
   - moves the card to Finished with `collect: false`.

   The `card.finished` audit record counts the proposals. `finish_card` from an
   analysis card's session is refused `analysis_expected`. `finish_analysis`
   from any other session is `not_a_card_session`.
4. **Nothing ships.** There is no collect, pull request, review step, demo or
   issue. The card never reaches the in-place finish (`finishInPlace`) or
   `BoardShipping`.
5. **Proposals become cards only by a person's choice.** `board_card_proposals`
   holds them per round and position, with a `status` of `pending`, `created`
   or `dismissed`. Create selected (C-506) turns the chosen ones into cards
   whose `originCardId` names the analysis card, and creates the dependencies
   between them. When no pending proposal is left, the analysis card completes
   itself. `BoardCardDetail` carries `analysis` (the latest report, its round
   and the proposals) and `origin` (`{number, title}` of the analysis card a
   card came from).
6. **A guard on the runner may flag the round.** `readOnlyViolation` on
   `finish_analysis` is set only by the runner daemon's guard. The daemon drops
   it from any other caller before relaying. It is stored on the round's run
   (`Run.readOnlyViolation`).

## Enforcement layers (C-504)

The read-only promise does not depend on the model's obedience:

1. **Deny rules at launch.** The worker's Claude Code session starts with
   permission rules that deny edits, writes and mutating shell commands.
2. **A detached worktree.** The round works in a worktree on a detached HEAD,
   with no card branch, so there is no branch to commit or push to.
3. **No shipping commands.** Nautelle sends no `card.collect`, `card.prOpen`,
   `card.review` or `card.demo` for an analysis card.
4. **A daemon guard.** When the worker finishes, the runner checks the
   worktree. If the worktree is dirty, the daemon reports `readOnlyViolation`
   with the finish and the person sees it on the round.

## Consequences

- Every exhaustive map over the card kind handles a third value: kind labels,
  chips and the work surface. A model-facing kind list uses `WORK_CARD_KINDS`,
  so a model never offers or picks `analysis`.
- An analysis card's branch name is always `card/c<n>-<slug>`, even with an
  issue. Its prefix card type is `feature`, so the prefix maps did not widen.
- A feedback round on an analysis card writes a new report and replaces only
  the proposals the person has not decided on.
- A runner without `cardReadOnly` cannot run an analysis card (C-505).

## Rejected alternatives

- **A `feature` card with a "do not change anything" prompt.** Nothing would
  enforce it, and it would still collect, open a pull request, review and
  record a demo.
- **Proposals as plain text in the report.** A person could not pick them one
  by one, Create selected could not make linked cards, and a feedback round
  could not tell decided proposals from new ones.
- **Letting the model classify a request as `analysis`.** "Look into X" is
  often meant as "fix X". A model that chose a read-only round on its own would
  leave the person with a report instead of the change they wanted.
