# ADR-0121: Every card that changes UI gets a demo

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-458-record-a-demo-for-a-bug-card-whose-pull.md`](../specs/card-458-record-a-demo-for-a-bug-card-whose-pull.md) ·
Relates to: [ADR-0090](0090-a-finished-card-may-carry-a-demo-video-recorded-by-demoflow-on-the-runner.md), [ADR-0095](0095-auto-merge-waits-up-to-fifteen-minutes-for-a-cards-demo-video.md) ·
Card: C-458 (stack S-19, stage 1)

## Context

The Board records a demo of a green head only for a `feature` card. A bug card
whose pull request changes the UI gets none, although the rule is that every
card that changes UI ends with a demo. The files of the pull request already
say whether a card changes UI: they are matched against the project's
`demoUiPaths`.

## Decision

1. **Any card kind.** `CardDemosService.autoRecord` no longer looks at the
   card's `kind`. The pull request's changed files against `demoUiPaths`
   decide for every card: a bug card that touches a UI path gets one automatic
   demo, one that touches none gets none. The Board's "deferred" log line
   (a conflicting head) is likewise written for every kind.
2. **The worker prompt** says the project "records a demo of every card that
   changes its UI", so a bug worker writes a scenario too.
3. **Base merges keep the demo.** A merge of the base branch into the card's
   branch does not make the demo obsolete; only a head that changes the
   card's own files does.
4. **Completed cards can be recorded.** A demo may be recorded, or recorded
   again, for a card in Completed.
5. **Scenario faults go back to the worker.** A scenario that fails to
   validate or to run is the worker's fault; it returns to the worker as a
   fix round instead of ending as a silent failed demo.
6. **A failed PR file read is retried.** When `pr.inspect` fails, the head is
   not remembered as having no UI; the next check reads the files again.

Points 3 to 6 are the rule the following stages of stack S-19 build; this
card implements points 1 and 2.

## Consequences

- More cards record demos; projects that want none switch demo videos off.
- Bug cards that only touch the API still record nothing.

## Alternatives considered

- **A per-kind setting.** Rejected: the files already say whether the UI
  changed, and a second switch would contradict the rule.
