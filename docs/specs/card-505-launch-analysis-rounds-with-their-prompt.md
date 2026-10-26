# C-505: Launch analysis rounds with their own prompt

Stack **S-23 "Analysis cards"**, stage 1. Needs C-503.

## Summary
Running an analysis card sends a read-only `card.run` with an analysis prompt: what to investigate, what not to
touch, and how to end with `finish_analysis`. The API refuses to run one on a runner without `cardReadOnly`
and skips everything a work round does to ship (issue, spec, draft PR, branch).

## Scope
**In:** `packages/shared/src/board/worker-prompt.ts` (a new `cardAnalysisPrompt`, the next-round and feedback
prompts for an analysis card), `apps/api/src/board/board-rounds.service.ts` (the Run of an analysis card).
**Out:** the runner (C-504), the UI.

## Decisions
- D1. The worker prompt is versioned: `CARD_WORKER_PROMPT_VERSION` goes 25 → 26
  ([Confirmed] `packages/shared/src/board/worker-prompt.ts:45`).
- D2. The prompt, in order: the question (card title and body, attachments as today); the rules — read-only,
  read code, docs and logs, run read-only commands and tests, do not edit, commit, push or open a PR (they are
  blocked and a dirty worktree fails the finish); the output — a report in markdown with
  `## What I looked at`, `## Findings` (each with evidence as `path:line`), `## Recommendation`; then the
  proposed cards, each one problem, one pull request, size S–M, with a body of `## Why`, `## What`,
  `## Done when`, a kind (`feature`, `bug`, or `task` for work a person does by hand), up to 5 labels and the
  earlier proposals it depends on; finally "call `finish_analysis` once with the report and the proposals; an
  empty list when nothing is worth doing". The kind line reads `Kind: analysis (read-only)` instead of the
  `bug fix | feature` line ([Confirmed] `worker-prompt.ts:592,878-879`).
- D3. Labels: the prompt lists the project's labels when the project has them (stack S-22) and asks to pick
  from them; without S-22 it omits the line. *Default chosen here; see Open questions.*
- D4. The Run of an analysis card (`board-rounds.service.ts`): no issue even for `issueOnRun`
  ([Confirmed] `board-rounds.service.ts:1026-1040`), no spec, no `pullRequest`, no `newBranch`/`startBranch`,
  no `demo`, no `escalate`; `readOnly: true`; `card.branch` stays null. A runner without `cardReadOnly` is
  refused with the existing runner-too-old board error, so the card stays in To Do with that reason.
- D5. Feedback on an analysis card starts another read-only round on the same session; its prompt says the
  previous proposals are replaced by the new `finish_analysis`.

## Acceptance criteria
- [ ] `worker-prompt.spec.ts`: `cardAnalysisPrompt` names `finish_analysis`, never `finish_card`, the PR
      description file or the push; carries the three report headings and the proposal shape; snapshot test.
- [ ] `board-rounds` e2e (fake runner): running an analysis card sends `readOnly: true` and no
      `pullRequest`, `demo` or `escalate`, opens no issue with `issueOnRun` on, and leaves `branch` null.
- [ ] The same e2e against a runner that does not advertise `cardReadOnly` refuses the Run with the runner
      error and starts nothing.
- [ ] A feedback round on an analysis card sends `readOnly: true` and the analysis feedback prompt.
- [ ] Feature and bug rounds are unchanged (existing prompt and rounds specs pass).

## Risks
- The prompt is long already; the analysis prompt replaces the work sections instead of adding to them.

## Open questions
- Labels without S-22 merged: Default — the prompt omits labels, and proposals carry an empty list.
