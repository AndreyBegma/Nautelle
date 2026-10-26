# C-485: Unit tests for projectRoleAtLeast and effectiveProjectRole

Stack **S-20**, stage 0. Closes issue #259.

## Summary
Every project permission check rests on two pure helpers:
- `projectRoleAtLeast`, the ordering of roles;
- `effectiveProjectRole`, which combines the global role and the project override, where an override can only lower a role.

Neither has a test. A wrong comparison here would let a viewer act as an operator everywhere.

## Scope
**In:** `packages/shared/src/projects/contracts.test.ts` (new).
**Out:** changing the helpers.

## Current behaviour
- [Confirmed] `packages/shared/src/projects/contracts.ts:71-89` defines both helpers.
- [Confirmed] No test file in `packages/shared/src` or `apps/api/src` imports them for testing (grep). Issue #259 is open.
- [Confirmed] `packages/shared` tests run with `bun test` (`packages/shared/package.json:38`).

## Acceptance criteria
- [ ] `projectRoleAtLeast`: all 9 pairs of (role, minRole) give the expected boolean, in a table-driven test.
- [ ] `effectiveProjectRole`: all 12 combinations of the global role × override (null, viewer, operator, admin) give the expected role. An override above the global role never raises it.
- [ ] `bun run test` in `packages/shared` passes. The PR says "Closes #259". No UI, so no demo.

## Open questions
- None.
