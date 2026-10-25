# ADR-0100: A project moves to another runner, and its sessions start fresh

Status: accepted · Date: 2026-10-25 ·
Card: C-400 ·
Spec: [`docs/specs/card-400-move-a-project-to-another-runner.md`](../specs/card-400-move-a-project-to-another-runner.md) ·
Relates to: [ADR-0001](0001-control-plane-and-per-machine-runner.md), [ADR-0006](0006-runtime-adapters-and-runtime-profiles.md), [ADR-0010](0010-typed-command-allowlist-on-the-runner.md), [ADR-0012](0012-detect-where-a-projects-documentation-lives.md), [ADR-0024](0024-board-cards-and-dedicated-card-workers.md)

## Context

A project is bound to exactly one runner: `Project.runnerId`, unique together
with `rootPath`. When the work moves to another machine, the only way so far
was to remove the project and connect it again. That loses the cards, their
rounds, the runs, the members and the settings.

Much of what the control plane keeps for a project belongs to the machine it
ran on:

- A card's Claude session (`sessionId`, `designSessionId`, the session's
  model, effort, type and prefix) lives in that machine's `~/.claude`.
- A card's worktree is a directory on that machine.
- The project's default runtime profile and the orchestrator's profile are
  rows of that runner (by id). Cards, skills and schedules name a profile by
  key.
- The docs source was detected under the old root.

A pool of runners per project is out of scope (spec C-400).

## Decision

1. **The move.** `POST /projects/:id/move` (admin) takes the target runner, the
   path of the repository's main checkout on it and, optionally, a default
   profile of that runner. The target runner inspects the path
   (`project.inspect`), as Connect does. The project keeps its id, so its
   cards, rounds, runs, members, settings and audit stay. The move writes
   the new `runnerId` and `rootPath` and what the inspection found. Then it
   pushes the watch list to both runners: the old one drops the root, the new
   one adds it.
2. **Refusals.** The move is refused when:
   - the target is the current runner (`same_runner`, 422);
   - the target runner is unknown (404) or revoked or offline
     (`runner_offline`, 409);
   - the path is not a main checkout (`not_main_checkout`, 409, with the
     suggested path);
   - the origin is not on GitHub (`unsupported_forge`, 422);
   - the checkout is of another repository than the project's
     (`different_repository`, 422, compared case-insensitively);
   - the profile is not one of the target runner's (`profile_not_on_runner`,
     422);
   - the target runner already has a project at that root
     (`already_connected`, 409).
3. **Nothing runs.** The move is refused (`work_running`, 409) while the project
   has:
   - a card round in an active phase;
   - a running run other than a card's or a slot's;
   - a fleet slot that is not `stale` or `ended`.

   The message lists what runs. The check runs again inside the move's
   transaction, so a round queued in between is refused too.
   `GET /projects/:id/move` answers what runs and which worktrees the move
   would leave, before the admin starts.
4. **Sessions start fresh.** The move clears the session fields of every card
   and its display `worktree`, and the `designSessionId` of every stack. The
   next round of a card therefore starts a new session on the new runner
   (`resume: false`) instead of resuming one that is not there. The cards'
   history (rounds, runs, messages, pull requests) is kept.
5. **Profiles are chosen again.** The default profile is the one the admin picks
   from the target runner's profiles, or none. The Settings dialog preselects
   the profile with the same key. The orchestrator's profile is cleared.
   Keys named by cards, skills and schedules stay: they resolve against the
   new runner's profiles.
6. **Docs.** A detected docs source is detected again from the target's
   inspection (ADR-0012). A manual source stays manual: an `in_repo` path under
   the old root moves with the root, and any other path is kept.
7. **The old machine is not touched.** The control plane reads no project files
   (ADR-0001), and the old runner gets no new command (ADR-0010). The move's
   answer, its audit record (`project.move`) and the Settings dialog list the
   worktrees left there: open cards' and live slots'. The dialog also lists the
   `git worktree remove` commands for the admin to run.
8. **Choosing the path.** The Settings dialog takes the target runner and a
   free-text path. The target runner validates the path, as the Connect
   dialog does. The repository picker the onboarding card plans (C-396) is not
   built yet; when it is, the dialog uses it, with the same API.

## Consequences

- An admin moves a project between machines without losing its Board.
- A card stopped mid-work on the old machine restarts its session on the new
  one: its next round begins without the old conversation.
- `Plan.sessionId` is required, so the move does not clear it. A plan's next
  turn may try to resume a session that the new machine does not have. This
  is a known limit.
- The admin removes the old worktrees by hand. Nautelle does not track whether
  they did.
- Rejected:
  - **A runner pool per project.** Out of scope; a project still runs on one
    runner at a time.
  - **Removing the old worktrees through the old runner.** The old machine may
    be gone or offline, and a new runner command that deletes directories for
    a project that is no longer on it widens the allowlist for a one-off.
  - **Waiting for running work instead of refusing.** A round may run for
    hours; the admin stops it, and Settings shows what runs.
  - **Keeping session ids and resuming on the new machine.** The session files
    are not there, and copying `~/.claude` between machines is the person's
    business, not the control plane's.
