# C-456: Let the runner record a demo on a detached checkout of a PR head

Stack **S-19 "Review steps and demo videos"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
The runner records a demo only in the card's own worktree. Once a card is Completed its worktree is removed, so its
demo can never be made — the real case is DemoFlow card C-171, accepted on 2026-10-26 before runner 0.18.0 could
record it. This card lets `card.demo` carry a PR head to check out: the runner records in a throwaway worktree
detached at that head and removes it afterwards. The API and the card sheet use it in C-463.

## Scope
**In**: the `card.demo` contract, a runner capability flag, the recorder, the worktree naming rule.
**Out**: lifting the API's `card_completed` refusal and the sheet's button (C-463).

## Current behaviour
- [Confirmed] `card.demo` args are a `strictObject` naming the card worktree by `root` and `shortId` (`packages/shared/src/protocol/commands/demos.ts:36-52`).
- [Confirmed] The recorder fails when the card's worktree does not exist (`apps/runner/src/demos/recorder.ts:303-310`) and reads the scenario from it (`recorder.ts:311-322`).
- [Confirmed] The runner advertises `cardDemo` (`apps/runner/src/daemon.ts:243`; `packages/shared/src/protocol/capabilities.ts:297-303`).
- [Confirmed] Runner-made worktrees are excluded from fleet slots by prefix (`apps/runner/src/fleet/session-name.ts:51-57`).

## Decisions
- ADR-0121 §3 (written by C-458): a demo can be recorded for any card with a pull request, Completed included; the runner records it on a detached checkout of the PR head when the card's worktree is gone. Source: the 2026-10-26 improvement plan (candidate 10).
- `card.demo` gains an optional `checkout: { pr: number, headSha: 40-hex }`. The API sends it only to a runner whose capabilities carry `cardDemoCheckout: true` (new, `capabilities.ts`), because the args are strict.
- With `checkout`, the recorder fetches `refs/pull/<pr>/head` and `headSha` from origin, adds `.wt-<repo>-demo-<shortId>` detached at `headSha`, records there with the same DemoFlow config, port and secrets rules, and removes the worktree when the run ends, whatever the outcome. `demo-` joins `NON_SLOT_WORKTREE`.
- `checkout` is used even when the card's worktree exists, so the video shows exactly the asked head.
- A `headSha` that cannot be fetched ends the demo `failed` with "`<sha>` of PR #<n> is not on origin".
- The control plane still reads no project file (ADR-0001); this is a typed field on an existing command (ADR-0010).

## API (runner protocol)
```ts
checkout: z.strictObject({ pr: z.number().int().positive(), headSha: headShaSchema }).optional()
```
Capabilities: `cardDemoCheckout: z.boolean().optional()`; the runner sets it with `cardDemo`.

## Acceptance criteria
- [ ] With `checkout` and no card worktree, the recorder creates `.wt-<repo>-demo-<shortId>` at `headSha`, records from it, and removes it afterwards, also when DemoFlow fails (`apps/runner/src/demos/recorder.spec.ts`).
- [ ] An unfetchable `headSha` fails the demo with the reason above and leaves no worktree (same spec).
- [ ] Without `checkout`, recording is unchanged (existing recorder specs pass).
- [ ] `slotOfWorktree` ignores a `-demo-` worktree (`apps/runner/src/fleet/session-name.spec.ts` or its existing spec).
- [ ] The runner's capabilities carry `cardDemoCheckout: true` when `card.demo` is enabled (daemon or capabilities spec).

## Risks
- A squash-merged PR keeps its commits only under `refs/pull/<n>/head` on GitHub; other forges may not keep them. Then the demo fails with the reason above.

## Open questions
- None.
