# C-454: `nautelle-runner worktrees [--prune]` lists and clears runner-owned worktrees; help aliases are tested

Stack **S-18 "Sessions, terminal and runner"**, stage 2. Needs C-439 (the sweep module). Includes issue **#260**
(help and version aliases are untested), because both edit `USAGE` and `cli.spec.ts`.

## Summary
A person who finds dozens of `.wt-<repo>-plan-*` and `-review-*` directories has no runner command to see which are
still in use and remove the rest; C-439 sweeps them only at daemon start. Separately, `help`, `--help`, `-h`,
`--version` and `-v` work but no test covers them, and `USAGE` does not list `help`.

## Scope
**In:** a `worktrees` command in `apps/runner/src/cli.ts` on top of `apps/runner/src/worktrees/sweep.ts` (C-439),
`USAGE`, `apps/runner/src/cli.spec.ts`, the Commands table in `apps/runner/README.md`.
**Out:** card worktrees and fleet slot worktrees (listed, never pruned).

## Current behaviour
- [Confirmed] `apps/runner/src/cli.ts:88-135` (`USAGE`) and `:602-622` (`COMMANDS`): no `worktrees` command; `help`
  is not listed.
- [Confirmed] `apps/runner/src/cli.ts:630-637`: `version`/`--version`/`-v` and `help`/`--help`/`-h` are handled.
- [Confirmed] `apps/runner/src/cli.spec.ts:59`: only `version` is tested (issue #260).

## Decisions
- D1. `worktrees` reads the runner's records offline (plan store, card store, review records — the same state files
  the daemon reads) and every watched project root from `runner.json`, and prints one line per runner-owned worktree:
  kind (`card`, `plan`, `review`), path, owner (card label / plan id / `orphan`), age. *Source: the 2026-10-26
  improvement plan.*
- D2. `--prune` removes the `orphan` plan and review worktrees with C-439's `removeRunnerWorktree`, after one
  confirmation in a TTY (`--yes` skips it). It refuses while the daemon holds its lock, and says to stop it or wait
  for the start-up sweep. Card worktrees are never pruned.
- D3. `USAGE` lists `help` and `worktrees`. *Source: #260.*

## Acceptance criteria
- [ ] `cli.spec.ts`: `help`, `--help`, `-h` exit `EXIT.ok` with `USAGE` on stdout and nothing on stderr;
      `--version` and `-v` print the same as `version` (#260).
- [ ] `cli.spec.ts` (temp repo): `worktrees` lists a card, a plan with a record and an orphaned review worktree with
      the right owners; `worktrees --prune --yes` removes only the orphan.
- [ ] `--prune` with the daemon lock held exits non-zero and removes nothing.
- [ ] `USAGE` and the runner README list `help` and `worktrees`.
- [ ] `bun run check` and the runner tests pass.

## Risks
- Reading the state files while the daemon writes them could see a half-written file; D2 refuses to prune while the
  daemon runs, and listing tolerates a parse error by marking the owner `unknown`.

## Open questions
- None.
