# C-403: Personal API tokens: the owner's rights or read-only, project scope, expiry, audit and revoke

Stack **S-16 "Core 4 — Team"**, stage *Channels and tokens*.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- Scripts and automation have no API credential. The routes in `apps/api/src/auth/auth.controller.ts` cover sessions
  only.
- On 2026-10-24 the orchestrator had to drive the API from a browser session, with the CSRF header.

## Decisions (grilling session)
- "The user's rights, plus a read-only variant."
- Scope is a project list. Tokens have an expiry, are audited and can be revoked.

## What
1. **Account › API tokens.**
   - Create a token with a name, a scope (the owner's rights, or read-only), an optional project list and an expiry.
   - The token is shown once and stored hashed.
   - The list shows each token's last use. A token can be revoked.
2. **Use.** `Authorization: Bearer <token>` on the REST API, with no CSRF.
   - A token never exceeds its owner's current role. A role downgrade applies at once.
3. **Audit.** Every use is attributed to the owner in the audit log as "via token `<name>`".
4. **Admin** can see and revoke any user's tokens.

## Out of scope
- OAuth apps.
- SSO. It is deferred, because the audience is the person plus the first external users.

## Touched areas
- `apps/api/src/auth/` (`guards/session.guard.ts`, `guards/csrf.guard.ts`, `tokens.ts`, `auth.controller.ts`)
- `apps/api/prisma/schema.prisma` and a migration (`prisma migrate dev`)
- `apps/web/src/app/account/` (a tokens page), `apps/web/src/app/admin/users/`

## ADRs to read
- ADR-0008 (local accounts), ADR-0048 (failed passwords slow the source), ADR-0081 (TOTP).
- **A new ADR is needed**: personal API tokens and how they bypass CSRF safely.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] `curl -H 'Authorization: Bearer …'` can list and run cards within the token's scope.
- [ ] A read-only token is refused writes.
- [ ] A token outside its project list is refused.
- [ ] An expired or revoked token is refused at once.
- [ ] The audit log shows "via token".

## Tests
- API: e2e for scope, read-only, the project list, expiry, revoke, the role downgrade, and the CSRF bypass only with
  Bearer.

## Open questions
- None.

## Implementation note
- The implementation is recorded in
  [ADR-0103](../adr/0103-personal-api-tokens-act-as-their-owner-never-above-the-owners-current-role.md),
  including the routes that refuse a token because they need a browser session.
