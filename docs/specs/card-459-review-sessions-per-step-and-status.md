# C-459: Run one review session per step on the runner and answer `card.reviewStatus`

Stack **S-19 "Review steps and demo videos"**, stage 1. Part of the 2026-10-26 improvement plan.

## Summary
The runner keeps exactly one review session per card, and the API cannot ask whether it is still alive. This card
makes the runner hold one review session per *step session* and adds a typed read, `card.reviewStatus`, that says
whether a review session is running, has exited, or is unknown. It also records ADR-0120, the decision the later
review cards of this stack implement (C-460, C-462, C-464, C-466). No API behaviour changes in this card.

## Scope
**In**
- Runner: review state, tmux session, worktree and test environment keyed by the review `session`, not by the card.
- `card.reviewStatus` (new typed command, ADR-0010, advertised per ADR-0023).
- `card.reviewStop` takes an optional `session`: stop that one session; without it, every review session of the card (today's behaviour).
- `BoardCommands.reviewStatus()` and the fake in the Board e2e world.
- ADR-0120 and its row in `docs/adr/README.md`.

**Out**
- Starting several steps at once (C-466), the retry and liveness use (C-464), counting reviews toward `maxRunning` (C-460).

## Current behaviour
- [Confirmed] One review session per card: `card.review` kills the card's review session and removes its record before starting the next (`apps/runner/src/cards/executor.ts:653-659`); the store is `<cardDir>/review` (`apps/runner/src/cards/review.ts:122-171`); the worktree is `.wt-<repo>-review-<shortId>` (`review.ts:33-43`); the env id is derived from the short id, "one review session runs per card at a time" (`review.ts:45-62`).
- [Confirmed] The tmux name is `nautelle-review-<shortId>` and the result schema only accepts that shape (`packages/shared/src/protocol/commands/cards.ts:947-955`).
- [Confirmed] "the review is not polled" — there is no status read (`executor.ts:633-642`); the review commands are `card.review`, `card.reviewStop`, `card.reviewPublish` (`cards.ts:1069-1088`).
- [Confirmed] `card.reviewStop` args are `cardTarget`, `root`, `shortId` only, as a `strictObject` (`cards.ts:994-998`).

## Decisions
- **ADR-0120 (new, written in this card): "Review steps run side by side, are retried once, report their liveness and count as card workers"** (amends ADR-0084 §3 "in order", extends ADR-0101 to review sessions). Its sections:
  1. A review step session is keyed by its `session` uuid on the runner; a card may have several at once.
  2. `card.reviewStatus` reads one session: `running`, `exited` (with whether `report_review` was called), or `unknown`.
  3. Every enabled step of a head starts at once, as room allows; a runner without `card.reviewStatus` keeps the old one-at-a-time order (C-466).
  4. A step that fails, times out, or exits without a report is retried once before the card needs a person (C-464).
  5. A running review session counts toward `maxRunning`, and a reached hard budget stops it; it restarts once the budget allows (C-460).
  6. A head whose only change since a passed head is a clean merge of the base passes on that head's review (C-462).
  Source: the 2026-10-26 improvement plan (candidates 1–5); ADR-0084 Consequences ("A card takes longer to reach Finished").
- The runner advertising `card.reviewStatus` is also how the API knows the runner holds several review sessions per card (ADR-0023: features check commands, not versions).

## API (runner protocol)
- `card.reviewStatus` — args `{ cardId, projectId, root, shortId, session: uuid }`; result
  `{ state: 'running' | 'exited' | 'unknown', reported: boolean }`. `exited` when the record exists and its tmux session
  is gone; `reported` is true once `card.reviewReport` was accepted for that session. Operator role, short timeout.
- `card.review` — unchanged args. Tmux name becomes `nautelle-review-<shortId>-<first 8 hex of session>`; worktree
  `.wt-<repo>-review-<shortId>-<first 8 hex of session>` (still matched by `NON_SLOT_WORKTREE`, `apps/runner/src/fleet/session-name.ts:57`);
  env id `cardReviewEnvId(shortId, session)`. It no longer kills other review sessions of the card. The result's
  `tmuxSession` schema accepts both the old and the new shape.
- `card.reviewStop` — optional `session`. The API sends it only to a runner that advertises `card.reviewStatus`.
- Store: `<cardDir>/review/<session>/` (state, run files); `all()` returns every session of every card.

## Acceptance criteria
- [ ] Two `card.review` calls for one card with different `session`s leave two tmux sessions and two worktrees; neither is killed (`apps/runner/src/cards/review.tmux.spec.ts`).
- [ ] `card.reviewStatus` answers `running`, then `exited` with `reported: false` after the tmux session dies, `reported: true` after a report, and `unknown` for a session it never started (runner spec).
- [ ] `card.reviewStop` with `session` stops only that session; without it, every review session of the card (runner spec).
- [ ] `report_review` from either session is matched to its own record (`executor.reviewSession`, runner spec).
- [ ] `BoardCommands.reviewStatus` exists and the Board e2e world answers it (`apps/api/src/board/testing/board-e2e.ts`).
- [ ] ADR-0120 is in `docs/adr/` and listed in `docs/adr/README.md`.
- [ ] `bun run check` and the runner and shared test suites pass.

## Risks
- Several review sessions of one card each need a test database and a port; the per-session env id keeps them apart.
- A runner upgraded mid-review keeps an old `<cardDir>/review/state.json`: the store reads it as one session so `card.reviewStop` still removes it.

## Open questions
- Should `card.reviewStatus` read several sessions in one call? Default: no, one session per call; the API asks only for runs that look stale.
