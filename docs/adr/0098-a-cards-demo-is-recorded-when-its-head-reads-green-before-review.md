# ADR-0098: A card's demo is recorded when its head reads green, before review

Status: accepted · Date: 2026-10-25 ·
Card: C-408 (issue #946) ·
Spec: [`docs/specs/946-card-demos-auto-record-does-not-fire-on.md`](../specs/946-card-demos-auto-record-does-not-fire-on.md) ·
Amends: [ADR-0095](0095-auto-merge-waits-up-to-fifteen-minutes-for-a-cards-demo-video.md) §1 and §2 ·
Relates to: [ADR-0084](0084-a-card-passes-its-review-steps-before-finished.md), [ADR-0001](0001-control-plane-and-per-machine-runner.md), [ADR-0010](0010-typed-command-allowlist-on-the-runner.md)

## Context

ADR-0095 asks for a card's demo when its head *ships*: green, after the review
steps of ADR-0084. On staging, C-388 and C-392 — feature cards whose PRs change
`apps/web/**` — never got one. Their green heads conflicted with the base, so a
`ci_fix` round was due instead; the next green head of C-392 was blocked by its
review steps, so a `review_fix` round was due. Neither head reached Finished,
and nothing said why there was no demo. The project's merge policy (`ask`) had
no part in it: the API never reads it.

A demo is what the person watches to judge a card, so a card the review holds,
or hands to a person, needs one most.

Recording also needs the app to start in the card's worktree. DemoFlow runs
`scripts/demo-dev.sh` there, and the script required `apps/api/.env`, which a
fresh worktree does not have.

## Decision

1. **Trigger (amends ADR-0095 §1).** The shipping check asks for the `auto`
   demo of a `feature` card's head as soon as it reads green (or ships without
   checks), *before* the review steps run, whatever comes of them. A card the
   review holds, sends back for `review_fix`, or hands to a person keeps the
   demo of the head that was reviewed, and the head a fix round pushes gets its
   own (one per head, ADR-0095 §3). A Finished card still gets its demo once its
   head reads green. A head that conflicts with the base is not recorded: the
   fix round replaces it, and it would edit the worktree under the recording.
2. **Every skip says why (amends ADR-0095 §2).** A head the Board does not
   record is logged once, with the card, the head and the reason: a bug card,
   demo videos off, a PR that changes no UI path (with the globs), a card that
   never ran, or a conflicting head. The memo of those lines lives in the API's
   memory, like the no-UI memo. These are log lines, not `skipped` demo rows:
   the card face shows its newest demo, and a row on every card that changes no
   UI would read "Demo skipped" on each of them. A demo the Board does ask for
   and cannot record is still a `skipped` row with its reason (ADR-0095 §5).
3. **The demo app starts from the Demo env.** Without `apps/api/.env`,
   `scripts/demo-dev.sh` takes `DATABASE_URL` from its environment — the
   project's Demo env, which the runner already hands to DemoFlow — and
   defaults `APP_ENV` to `development` and `TRUST_PROXY` to `loopback`. It
   fails with a message that names the Demo env when neither is there. A
   variable in the environment already wins over `apps/api/.env`, which dotenv
   and Nest never override, and the demo API sets its own `API_URL`.

## Consequences

- With review steps on, a demo is recorded while the review runs; with
  auto-merge on, the merge after the review still waits for it while it is in flight, within the 15-minute cap (ADR-0095 §6).
- A head the review blocks costs one recording that no merge uses; a card a
  review sends back three times records up to four heads.
- `pr.inspect` runs on the first green read of a head, not the last.
- A person sees in the API's log why a card got no demo, instead of guessing.
- A project's Demo env holds `DATABASE_URL` for the dev PostgreSQL server when
  its worktrees have no `apps/api/.env`. The runner needs no new command
  (ADR-0010), and the control plane still reads no project file (ADR-0001).
- Rejected:
  - **The runner copies `apps/api/.env` into each worktree.** It would be a new
    runner command that writes a project file, for what the Demo env already
    carries.
  - **A `skipped` row for every head without a demo.** The card face would show
    "Demo skipped" on every card that changes no UI.
  - **Recording a conflicting head.** Its fix round would change the worktree
    while DemoFlow records it, and the head would be superseded anyway.
