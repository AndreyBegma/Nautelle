# C-477: Start plans in a fresh session after a project moves to another runner

Issue: #1003

## Why
A move clears card sessions but not plans (Plan.sessionId is required), so a plan's next turn resumes a session that exists only on the old machine — ADR-0107's known limit.

## What
- Plan.sessionSince (migration 20261231000049).
- The move gives plans a new session id, sets sessionSince, clears task sessions.
- Plan turns count only turns after sessionSince; with none, start fresh, no fork.

## Done when
- Move e2e and plan-turn spec (the test that would have caught it) pass.
- Second turn resumes normally.
- No UI.

Evidence: apps/api/src/projects/project-move.service.ts:182-198; apps/api/src/planner/plan-turn.service.ts:786-810

Spec: docs/specs/card-477-plans-start-fresh-after-a-move.md
