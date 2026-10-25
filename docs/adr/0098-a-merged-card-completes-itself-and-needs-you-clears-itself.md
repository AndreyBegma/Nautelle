# ADR-0098: A merged card completes itself, and Needs you clears itself

Status: accepted · Date: 2026-10-25 · Card: C-389 ·
Spec: [`docs/specs/card-389-a-card-whose-pull-request-merged-moves-t.md`](../specs/card-389-a-card-whose-pull-request-merged-moves-t.md) ·
Amends [ADR-0035](0035-a-card-ships-itself.md) §5, [ADR-0024](0024-board-cards-and-dedicated-card-workers.md) §6 and [ADR-0029](0029-accepting-a-board-card-may-merge-its-pull-request-through-the-runner.md) ·
Relates to [ADR-0084](0084-a-card-passes-its-review-steps-before-finished.md)

## Context

ADR-0035 §5 keeps a merged card in Finished until a person moves it to
Completed, as ADR-0024 §6 and ADR-0029 also say. Since cards ship themselves,
Finished filled with merged work (19 cards on 2026-10-25), so it no longer
means "waits for your review". The merge was already a person's decision:
they merged on GitHub, pressed Accept, or turned the project's auto-merge on.

The Overview "Needs you" list had the same problem from the other side. It
listed items whose subject was gone: blocked slots whose session had died
days earlier, approvals of pull requests that merged while no event reached
Nautelle, and failures of the control plane's own services, such as
Steward's digest prose.

## Decision

1. **A merge completes the card.** When a card's PR merges into the project
   base, the card moves from In progress or Finished to Completed with the
   new move source `merged`, as the system. The move sets `completedAt`,
   sends `card.close` (the worktree is removed, ADR-0024 §6), and is audited
   as `card.completed_by_merge`. An Accept that merges still audits
   `card.accepted`. Accept stays for a card that has no PR to merge.
2. **What does not complete.** Fleet and terminal cards keep their own life
   (ADR-0030). A stacked PR merged into its dependency's branch has not
   landed (ADR-0064), so the card stays. A card with an active round waits
   until the round ends, and is then completed.
3. **A merge on GitHub is seen.** A Finished card whose PR the CI pass does
   not read (auto-merge off, a protected path, a card that needs a person)
   has its PR read at most every `CARD_FINISHED_PR_POLL_MS` (5 minutes). The
   read records only `merged` (which completes the card) or `closed` (which
   leaves the card in Finished for Accept or feedback). Its checks are not
   stored, so the read never feeds the auto-merge pass.
4. **The existing merged cards move by the same rule.** The one-time
   migration is a sweep in the board poll, not SQL: every merged card in
   Finished that rule 2 does not exclude is completed through the same move,
   so its worktree is cleaned up by the runner. Once the backlog is gone the
   sweep finds nothing.
5. **Feedback on a merged card reopens it.** A person moves the card back
   from Completed and sends feedback, which opens a new round on a fresh
   branch and a new PR, as ADR-0035 §5 described.
6. **A Needs-you item leaves when its subject does.**
   - A blocked or prompting slot is listed only while its session is alive
     (`running`, `idle`, `prompt`, `quota`). A stale or dispatched slot has
     no session left to answer.
   - The API reads every PR with a current approval every
     `APPROVAL_SWEEP_MS` (5 minutes) through `pr.inspect`. Any read that
     finds the PR merged or closed closes its row, as `pr.merged` and
     `pr.closed` would have. A runner that cannot answer leaves the row for
     the next sweep.
   - A card session's question clears when the runner reports no question
     (ADR-0094), and an action request expires at its deadline. Both already
     resolved themselves; this ADR keeps them so.
   - The failed runs of the control plane's own services
     (`SERVICE_RUN_KINDS`: Steward, card capture, normalization, assessment,
     code questions, profile learning, rules and prefix upkeep) are not
     listed. They stay in Activity's runs tab. The AI digest records its
     failures as events, which are in Activity only.

## Consequences

- Finished shows only unmerged work, and Completed fills without a click.
- A Finished card without auto-merge costs one `card.checks` read per five
  minutes. Each current approval costs one `pr.inspect` per five minutes.
- A merged card's worktree is removed as soon as it merges. A follow-up
  starts from Completed rather than from Finished.
- Rejected: a SQL migration that sets the column. It would skip `card.close`
  and leave the worktrees behind.
- Rejected: reading Finished cards in the CI pass. Their stored checks would
  make a card that waits for a person eligible for auto-merge, and in tests
  a dependency card was merged early.
