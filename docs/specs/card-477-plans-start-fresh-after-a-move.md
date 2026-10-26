# C-477: After a project moves to another runner, its plans start a fresh session

Stack **S-20**, stage 0. Kind: bug.

## Summary
Moving a project to another runner clears every card's session, so the next round starts fresh on the new machine (ADR-0107 §4). Plans are left alone because `Plan.sessionId` is required. A plan's next turn therefore tries `--resume` with a session that exists only on the old machine, and fails. ADR-0107 Consequences names this as "a known limit". The other half of that candidate, listing the old worktrees for cleanup, is already done (ADR-0107 §7).

## Scope
**In:** the move transaction, the plan turn's session choice, and one column.
**Out:** design sessions and card sessions (already handled), and the old machine.

## Current behaviour
- [Confirmed] `apps/api/src/projects/project-move.service.ts:182-198` clears the cards' `sessionId` and `designSessionId`, and the stacks' `designSessionId`. Plans are not touched.
- [Confirmed] `apps/api/src/planner/plan-turn.service.ts:786-810`:
  - a plan-level turn resumes `plan.sessionId` when any earlier turn of the plan "started" (`sessionStarted`, `:108-110`);
  - a task turn forks from `plan.sessionId`, or resumes `task.sessionId`.
- [Confirmed] `Plan.sessionId String @db.Uuid` is required (`apps/api/prisma/schema.prisma:2811`).

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000049_plan_session_since`: `Plan.sessionSince DateTime?`. Only turns created after it count as having started the current session. Null means every turn counts, as today.

## Decisions
- The move gives each plan of the project a new `sessionId` (`randomUUID`) and sets `sessionSince = now()`, and clears every task's `sessionId`, in the same transaction as the cards (ADR-0107 §4, extended to plans).
- `session()` counts started turns only where `createdAt > plan.sessionSince`. With no started turn since then:
  - a plan-level turn starts the new id (`resume: false`);
  - a task turn starts its own new session (`resume: false`, no `forkFrom`), because there is nothing to fork on the new machine.
- The move's answer and its audit record add `plansReset: <count>`.
- No ADR. This removes the known limit within ADR-0107's own rule ("sessions start fresh"). The PR links ADR-0107.

## Acceptance criteria
- [ ] `apps/api/src/projects/projects.e2e.spec.ts` (the move cases): after a move, every plan of the project has a new `sessionId` and a `sessionSince`, and its tasks have no `sessionId`. Plans of other projects are untouched.
- [ ] `apps/api/src/planner/planner.e2e.spec.ts` or a new `plan-turn.service.spec.ts` (the test that would have caught it): a plan with succeeded turns before `sessionSince` gets `resume: false` on its next plan turn. A task turn gets `resume: false` without `forkFrom`.
- [ ] After a second turn on the new runner, the plan resumes normally (`resume: true`).
- [ ] No UI change, so no demo. The move dialog's copy is unchanged.

## Risks
- The plan's conversation history is lost on the new machine, like a card's. ADR-0107 already accepts this for cards.

## Open questions
- None.
