# C-504: The runner launches analysis rounds read-only

Stack **S-23 "Analysis cards"**, stage 1. Needs C-503 (`readOnly` in `card.run`, `card.finishAnalysis`).

## Summary
A `card.run` with `readOnly: true` starts a session that cannot write to the repository: it cannot edit files,
commit, push or open a pull request, and the runner never does any of that for it. The session is offered
`finish_analysis` instead of `finish_card`. The runner advertises `cardReadOnly`.

## Scope
**In:** `apps/runner/src/cards/` launch and executor, the MCP tool list, the daemon's finish guard, the
capability report.
**Out:** the prompt (C-505), the API gating (C-505).

## Decisions
- D1. Read-only is enforced on the runner, not by the prompt alone — *the person, 2026-10-26 interview (Q15)*.
  The runner still takes typed commands only (ADR-0010): read-only is a field of `card.run`, not a free
  argument list.
- D2. Four layers; any one is enough to keep the repository clean, together they make a slip visible:
  1. **Deny rules at launch.** `cardArgv` ([Confirmed] `apps/runner/src/cards/launch.ts:78-110`) adds
     `--disallowedTools` with `Edit`, `Write`, `NotebookEdit`, and the Bash patterns `git commit`, `git push`,
     `git merge`, `git rebase`, `git reset`, `git checkout`, `git switch`, `git stash`, `git tag`, `git branch`,
     `git worktree`, `gh pr`, `gh issue`, `gh release`, `gh api`. The project's permission mode is kept
     (forcing `manual` would park unattended fleet rounds on prompts); deny rules apply in every mode,
     `bypassPermissions` included — to be checked against the installed Claude Code (see criteria). The flag
     works under every wiring — plugin, injected or Token saver ([Confirmed] `launch.ts:91-97`) — because it
     is argv, not a settings file.
  2. **Detached worktree.** The card worktree is checked out at `origin/<base>` detached; no branch is created
     and nothing has an upstream.
  3. **No write commands from the runner.** A read-only round never pushes or opens a draft PR (the schema
     already forbids `pullRequest` with `readOnly`, C-503); `card.collect` for a card whose last round was
     read-only is refused `invalid_args`.
  4. **Daemon guard on finish.** Before relaying `card.finishAnalysis`, the daemon (beside the artifact guard,
     [Confirmed] `apps/runner/src/local/service.ts:434-436`, `apps/runner/src/cards/finish-guard.ts:106-130`)
     checks the worktree: `git status --porcelain` empty and `HEAD` equal to the start commit. If not, it
     refuses with `read_only_violation` and names the changed paths ("This is an analysis card: undo your
     changes and call finish_analysis again"). On the third attempt it resets the worktree
     (`git reset --hard <start>` and `git clean -fd`, the worktree is the runner's) and relays the finish with
     `readOnlyViolation: true`, which the API stores on the round's run as a warning.
- D3. Tool list: an analysis session (`CARD_ANALYSIS_ENV = 'NAUTELLE_CARD_ANALYSIS'`, set by the launch like
  `CARD_REVIEW_ENV`, [Confirmed] `apps/runner/src/cards/review.ts:103`) is offered `finish_analysis` and not
  `finish_card` or `escalate_card`, as a review session is offered `report_review`
  ([Confirmed] `apps/runner/src/mcp/tools.ts:629-650`).
- D4. Ignored files (build output, test databases) do not count as a write: `git status --porcelain` without
  `--ignored`. Running tests is allowed.

## Configuration
None.

## Acceptance criteria
- [ ] `launch.spec.ts`: a `readOnly` round's argv carries `--disallowedTools` with every entry of D2.1 and the
      project's `--permission-mode`, under plugin, injected and Token saver wiring.
- [ ] `executor.spec.ts`: a `readOnly` round creates no branch, its worktree `HEAD` is detached at
      `origin/<base>`, and no `git push` or `gh pr` runs during or after the round (exec fake).
- [ ] `card.collect` for a read-only card is refused `invalid_args`.
- [ ] Daemon guard tests: a dirty worktree is refused `read_only_violation` twice with the paths; the third
      call resets the worktree and relays with `readOnlyViolation: true`; a clean one relays at once.
- [ ] The MCP server of an analysis session lists `finish_analysis`, not `finish_card` (`server.spec.ts`).
- [ ] The runner reports `cardReadOnly: true`; an older API that never sends `readOnly` sees no change.
- [ ] Checked by hand against the installed Claude Code: a denied `Edit` and a denied `git commit` are refused
      in an interactive session started with this argv (note the version in the PR).

## Risks
- `--disallowedTools` Bash patterns match command prefixes; `bash -c "git commit …"` or a script could slip
  past layer 1. Layers 2–4 still hold: nothing pushes, and a commit fails the finish guard.
- If the installed Claude Code ignores deny rules under `bypassPermissions`, the round must fall back to
  `auto` for analysis cards; the card records which it found.

## Open questions
- Should the session also run without a GitHub token in its env? Default: no change — `gh pr`/`gh api` are
  denied and nothing has an upstream; revisit if a violation is seen.
