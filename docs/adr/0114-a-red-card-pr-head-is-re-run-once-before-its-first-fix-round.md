# ADR-0114: A red card PR head is re-run once before its first fix round

Status: accepted · Date: 2026-10-27 ·
Spec: [`docs/specs/card-414-rerun-red-ci-once-before-a-fix-round.md`](../specs/card-414-rerun-red-ci-once-before-a-fix-round.md) ·
Amends: [ADR-0035](0035-a-card-ships-itself.md) (red CI is fixed in `ci_fix` rounds) ·
Relates to: [ADR-0010](0010-typed-command-allowlist-on-the-runner.md), [ADR-0023](0023-runners-advertise-their-commands.md), [ADR-0043](0043-a-card-pr-ci-never-reported-on-is-retriggered-once.md) ·
Card: C-414 (stack S-17, stage 1)

## Context

Under ADR-0035 a card whose pull request goes red starts a `ci_fix` agent round at once, and three such rounds hand the card to a person. A flaky failure costs a whole agent round and one of the three attempts. On 2026-10-26 a Jest worker ran out of memory in a suite the card never touched, and a fix round started on a head that had nothing to fix.

Spec 359 settled this as its Q1: re-run a failed GitHub Actions run once, and send any other CI straight to a fix round. It was never built. Nautelle's own CI is Woodpecker, which has no `gh run rerun`, so Q1 as written would not help the project that hit the flake.

## Decision

1. **Every red head is re-run once, before its first fix round.** When `BoardShipping.fix()` is about to start a round for red CI and the card's `ciRerunSha` is not the PR's head, it re-runs the head instead and stores the head as `ciRerunSha` (migration `20261231000041_card_ci_rerun_sha`). The next poll that still reads the same head red starts the fix round. A head a fix round pushes is new, so it is re-run once too. A follow-up pull request clears `ciRerunSha` with the other CI fields.
2. **The re-run is not a fix attempt.** It happens before the budget check and does not touch `ciFixAttempts`. A re-run that goes green ships the card with `ciFixAttempts` 0.
3. **The provider is read from the failed checks' links.** When every failed check links to `https://github.com/<owner>/<repo>/actions/runs/<id>[/job/<id>]`, the API sends the new typed runner command `card.ciRerun` with the distinct run ids (at most `CARD_CI_RERUN_RUNS_MAX`, 10). The runner checks that the pull request is open and still at that head, then runs `gh run rerun <id> --failed --repo <owner>/<repo>` for each id, with argument arrays only. Any other CI, a check without a link, mixed providers or more runs than the limit get the pull request's event again through `card.ciRetrigger` (ADR-0043's close and reopen) with `reason: 'red'`, which makes the reopen comment say why. A reopen re-triggers every pull-request CI, GitHub Actions included. This widens spec 359 Q1 from GitHub Actions to all CI.
4. **The re-run waits for checks still running.** While any check of a red head is pending, the API neither re-runs nor starts a round: `gh run rerun` refuses a run in progress, and a reopen would cancel pipelines that are still running.
5. **A head counts as re-run whatever the runner answers.** `ciRerunSha` is stored even when the runner refuses (`not_open`, `head_moved`, `gh_failed`) or the command fails, so a broken re-run cannot loop. Every re-run is audited as `card.ci_rerun` with the head, the provider (`github_actions` or `pr_event`), the run ids and, on failure, the error; a failure is recorded with result `error`, and the next poll starts the fix round.
6. **A conflict is never re-run.** A pull request that conflicts with its base goes straight to its fix round, as before.
7. **Older runners go straight to the fix round.** The API re-runs only when the project's runner advertises `card.ciRerun` (ADR-0023). Because `card.ciRetrigger` arguments are a strict object, the new `reason` key is sent only to runners that advertise `card.ciRerun`; an older runner never receives a key it would refuse.

## Consequences

- A flaky red head costs one re-run and a poll interval instead of an agent round and a fix attempt.
- A head that is really broken starts its fix round one poll later than before.
- On any CI other than GitHub Actions the pull request timeline gets one closed and reopened pair per red head, the same cost ADR-0043 accepted for lost webhooks.
- Whether Woodpecker builds on `reopened` is not confirmed; ADR-0043 relies on it as well. If it does not, the re-run is a no-op and the fix round starts on the next poll.
- A poll that runs right after a reopen, before the CI reports the new pipeline as pending, still reads the old red and starts the fix round. The re-run is lost in that case, never repeated.
- A pull request a failed reopen left closed is only audited; reopening it is a person's job, as under ADR-0043.
