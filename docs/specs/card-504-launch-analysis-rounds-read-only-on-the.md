# C-504: Launch analysis rounds read-only on the runner

## Why
An analysis card must not write to the repository: no edits, commits, pushes or pull requests. A prompt alone does not guarantee it.

## What
- `card.run` with `readOnly`: `--disallowedTools` for Edit/Write/NotebookEdit and git/gh write commands, under every wiring.
- The worktree is detached at `origin/<base>`; no branch, no push, no draft PR; `card.collect` refused for it.
- The daemon checks the worktree before relaying `finish_analysis`: dirty or moved HEAD is refused `read_only_violation` twice, then reset and relayed flagged.
- An analysis session gets `finish_analysis`, not `finish_card`.
- The runner advertises `cardReadOnly`.

## Done when
- Launch, executor, guard and MCP tests cover each layer.
- A denied Edit and git commit are confirmed against the installed Claude Code.

Evidence: apps/runner/src/cards/launch.ts:78, apps/runner/src/cards/review.ts:103, apps/runner/src/local/service.ts:434

Spec: docs/specs/card-504-runner-read-only-analysis-rounds.md
