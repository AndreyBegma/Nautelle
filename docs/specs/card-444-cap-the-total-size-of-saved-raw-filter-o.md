# C-444: Cap the total size of saved raw filter outputs across run directories

## Why
Raw outputs are capped per file (10 MB) and per run dir (200 MB), but not in total; many rounds, plans and orchestrator dirs add up with no bound.

## What
- A 1 GiB total cap across raw dirs, checked at most once a minute on file create; oldest files go first down to 80 %; the current run is never pruned.

## Done when
- Tests: cross-dir pruning order, the current run untouched, one check per minute.

Evidence: apps/runner/src/filter/raw-store.ts:15-21,26-51,58-64.

Spec: docs/specs/card-444-cap-saved-raw-outputs-total.md
