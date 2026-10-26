# C-485: Add unit tests for projectRoleAtLeast and effectiveProjectRole

## Why
Every project permission rests on two untested pure helpers (issue #259).

## What
- Table-driven tests: 9 pairs for projectRoleAtLeast, 12 combinations for effectiveProjectRole.

## Done when
- bun test passes in packages/shared; PR closes #259.

Evidence: packages/shared/src/projects/contracts.ts:71-89; issue #259

Spec: docs/specs/card-485-tests-for-project-role-helpers.md
