# C-417: Disable Run with the reason when two dependencies are Finished but unmerged

Issue: #982

## Why
A card depending on two Finished, unmerged cards shows Ready and an enabled Run, then the click is refused dependencies_unmerged (ADR-0065 Consequences).

## What
- `CardDependencyRef.landed`; readiness gets `blocked` when every dependency is satisfied but more than one has not landed.
- Run disabled with "C-1 and C-2 are not merged yet…"; chip "Blocked"; Auto-run waits.

## Done when
- Shared unit: two unmerged → blocked, one merged → ready.
- Web test for the disabled Run; DemoFlow demo.

Evidence: packages/shared/src/board/dependencies.ts:61-90; apps/api/src/board/board-dependencies.service.ts:254-266

Spec: docs/specs/card-417-run-says-why-unmerged-dependencies-block.md
