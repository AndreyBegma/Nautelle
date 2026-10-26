# C-511: Let a stuck card's worker raise a task for a person and resume its session after Done

## Why
When a worker needs a credential, a gate or a manual step, it stops or fails. needsPerson only knows CI, review and branch reasons, so nobody learns what to do, and the card does not continue on its own.

## What
- A worker-only MCP tool `need_person` {title, why, checklist?}, modelled on escalate_card.
- It creates a task for the round's author (fallback: armer, creator, oldest project admin) and makes the code card depend on it.
- The round ends `finished`, so a stack run does not pause. The card goes back to To Do with its session, with no collect.
- After Done, the card resumes the same session (new trigger `task_done`, migration 20261231000054) with the checklist and note in the prompt. This goes through its stack-run entry, or else Auto-run when ready.
- One open raised task per card.

## Done when
- e2e: need_person → task for the author → Done → a resumed round with the same sessionId, inside a stack run too.
- Manual sessions are refused; older runners are unaffected.

Evidence: packages/shared/src/board/types.ts:231, apps/api/src/board/board-run-queue.ts:37, apps/api/src/local/local-handlers.ts:212

Spec: docs/specs/card-511-stuck-card-raises-a-task-and-resumes.md
