# C-423: The ci_fix prompt quotes the failed step's log tail

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
The fix prompt names the failed checks and their links but no log, so the worker re-runs the whole suite to guess what
failed and cannot tell an out-of-memory runner from a real failure. The prompt now carries the tail of the failed
step's log when the runner can read it.

## Current state
- [Confirmed] `packages/shared/src/board/worker-prompt.ts:652-660`: "CI logs are not quoted — the worker reproduces
  the failure itself".
- [Confirmed] `BoardRoundsService.ciFix` builds the round from `CardCiFixInput`
  (`apps/api/src/board/board-rounds.service.ts:530-552`, prompt at `:1176`).
- [Confirmed] There is no runner command that reads CI logs (`apps/runner/src/cards/`).

## Decisions
- GitHub Actions logs only, read by the runner with `gh` (the person, 2026-10-26 interview: no provider tokens).
  Other CI: the prompt says the log could not be read here and keeps the link.
- The prompt tells the worker: when the log shows a cause outside the branch's change (out of memory, network,
  infrastructure), change nothing and say so in the `finish_card` summary. C-420 makes such a round hand the card to
  a person instead of looping.
- Part of ADR-0114 (C-414); no new ADR.

## API / Runner
- New typed runner command `card.ciLog` `{projectId, root, pr, headSha, links: string[]}` in
  `packages/shared/src/protocol/commands/cards.ts`, served by `apps/runner/src/cards/ci-log.ts`: for each Actions job
  link, `gh run view --job <id> --log-failed --repo <github>`; keeps the last 80 lines, at most 8 KiB per check, URL
  userinfo redacted (`redactUrlUserinfo`). Other links: `{tail: null, reason: 'unsupported_ci'}`.
- `CardCiFixInput` (`reason: 'red'`) gets `logs: {name, tail: string|null}[]`. `ciFix` reads them before the round
  starts; a failed or missing command (older runner) gives `[]` and the round starts as today.
- `cardCiFixPrompt` adds, per failed check, a fenced "last lines of the failed step" block and the instruction above.

## Acceptance criteria
- [ ] Unit (`worker-prompt.spec.ts`): the prompt quotes a tail, cuts it at 8 KiB, and says "log not readable here"
      for a `null` tail.
- [ ] Runner unit (`ci-log.spec.ts`): Actions job links run `gh run view --job`; other links are not fetched; argument
      arrays only.
- [ ] e2e: a red Actions check starts a `ci_fix` round whose prompt contains the tail; an older runner starts the
      round without it.

## Risks
- Logs can hold secrets that CI did not mask. Mitigation: only the failed step, capped, userinfo redacted; GitHub
  masks registered secrets.

## Open questions
- Woodpecker logs through its API? Default: no; a later card if the person adds a Woodpecker token setting.
