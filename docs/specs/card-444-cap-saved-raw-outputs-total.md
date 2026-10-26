# C-444: Saved raw outputs have a total size cap across run directories

Stack **S-18 "Sessions, terminal and runner"**, stage 0.

## Summary
The filter keeps each command's raw output on disk so a worker can read what was cut. One file is capped at 10 MB
and one run directory at 200 MB, but nothing caps the sum: a machine with many card rounds, plan turns and the
orchestrator's session dirs keeps up to 200 MB per directory until each run is removed.

## Scope
**In:** `apps/runner/src/filter/raw-store.ts`, its tests.
**Out:** the per-file and per-directory caps; where run directories live.

## Current behaviour
- [Confirmed] `apps/runner/src/filter/raw-store.ts:15-21`: `RAW_CAP_BYTES` 10 MB, `RAW_DIR_CAP_BYTES` 200 MB.
- [Confirmed] `apps/runner/src/filter/raw-store.ts:26-51`: pruning walks one directory's `<n>.log` files.
- [Confirmed] `apps/runner/src/filter/raw-store.ts:58-64`: `removeRawDir` removes a run's raw dir when the run is
  removed; a round's run dir outlives the round.
- [Unknown] The total on the person's machine; the card measures it once and notes it in the PR.

## Decisions
- D1. `RAW_TOTAL_CAP_BYTES = 1 GiB` across every `raw/` directory of the runner's run dirs ([Unknown] whether all of
  them live under the state dir; the card lists the roots it walks in the PR).
  *Source: the 2026-10-26 improvement plan.*
- D2. Checked before a new raw file is created, at most once a minute per process (a marker file's mtime): when
  over, the oldest files by mtime go first, across directories, until the total is 80 % of the cap. The file being
  written and the current run's directory are never pruned.
- D3. A raw file a worker was pointed to and that was pruned is simply missing; the worker re-runs the command with
  `NAUTELLE_RAW=1`. No new message.

## Acceptance criteria
- [ ] `raw-store.spec.ts`: three run dirs over the total cap are pruned oldest-first across dirs down to 80 %; the
      current run's dir is untouched.
- [ ] Two creates within a minute check the total once.
- [ ] `bun run check` and the runner tests pass.

## Risks
- The filter runs on the hot path of every Bash call; D2 limits the walk to once a minute.

## Open questions
- Is 1 GiB the right total? Default: 1 GiB, a constant beside the other caps.
