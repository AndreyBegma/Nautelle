# C-422: A card made from a ready issue drops the orchestrator's ready label

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
Queue's "Make a card" turns an incoming issue into a Board card, but the issue keeps the orchestrator's ready label,
so cs-orchestrator may pick the same issue up and the work is done twice (ADR-0098 Consequences). Making the card now
removes the label.

## Current state
- [Confirmed] ADR-0098 Consequences: "Make a card leaves the label alone; removing it is the person's choice on
  GitHub."
- [Confirmed] `BoardService.create` links the issue (`apps/api/src/board/board.service.ts:565-569,593-594`).
- [Confirmed] The ready label is `readyLabelOf(project)` (`apps/api/src/queue/queue-inputs.ts:13`, default `cs:ready`).
  The runner can add it (`plan.queue_issues`, `apps/runner/src/planner/queue-issues.ts`) but has no command that
  removes it.

## Decisions
- A card made from an issue removes the project's ready label from that issue (the person, 2026-10-26 interview). The
  orchestrator lives outside this repository and reads only GitHub, so the label is the one switch it sees.
- New typed runner command `plan.unqueue_issues` `{projectId, numbers, readyLabel}` → `gh issue edit <n>
  --remove-label <label>`, argument arrays only (ADR-0010). An issue without the label is no error.
- Best effort: a failure, or a runner that lacks the command, is audited (`card.ready_label_kept`) and never fails the
  create.
- Amends ADR-0098's consequence; noted there with a link to this spec. No new ADR.

## API / Runner
- `packages/shared/src/protocol/commands/planner.ts`: the command and its result `{unlabelled: number[]}`.
- `apps/runner/src/planner/unqueue-issues.ts`, wired in `apps/runner/src/planner/index.ts` and
  `apps/runner/src/commands/handlers.ts`.
- `BoardService.create`: after the card commits, when `issueNumber` is set, send it through `BoardCommands`.

## Acceptance criteria
- [ ] e2e: Make a card from issue #12 labelled `cs:ready` sends `plan.unqueue_issues` with `[12]` and the project's
      label; the card exists either way.
- [ ] e2e: a runner error leaves the card and records `card.ready_label_kept`.
- [ ] Runner unit: the argument array; a missing label counts as success.

## Risks
- A person who wanted both may re-add the label on GitHub.

## Open questions
- Also skip issues that have a card in Nautelle's own Queue? Default: already so for the Queue list (ADR-0098); no
  change.
