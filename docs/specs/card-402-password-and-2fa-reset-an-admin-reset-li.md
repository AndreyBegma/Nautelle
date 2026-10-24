# C-402: Password and 2FA reset: an admin reset link, and self-service reset when SMTP is set

Stack **S-16 "Core 4 — Team"**, stage *Account recovery*. It needs C-404 for the self-service path.
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
There is no "forgot password" flow and no admin reset. The only routes are `PATCH auth/me/password`
(`apps/api/src/auth/auth.controller.ts`) and the `admin:create` CLI. Losing the encryption key locks out every 2FA
account (ADR-0081).

## Decisions (grilling session)
- "An admin reset link, plus self-service reset when SMTP is configured."

## What
1. **Admin reset.** In Admin › Users (`apps/web/src/app/admin/users/`):
   - **Reset password** and **Reset 2FA** each give a one-time link that expires, works once, is stored hashed and
     is audited.
   - The user sets a new password and enrols 2FA again if it was reset.
2. **Self-service.** With SMTP configured (C-404), **Forgot password** on the login page sends the same kind of link
   by email.
   - Without SMTP, the login page says to ask an admin.
   - The response is the same whether the email exists or not.
3. **Rate limits** follow ADR-0048: the source slows down, and the account is never locked.
4. **Sessions.** A successful reset ends the user's other sessions.

## Out of scope
- SSO, or recovery through another identity provider.

## Touched areas
- `apps/api/src/auth/` (`auth.controller.ts`, `auth.service.ts`, `password.ts`, `two-factor.service.ts`, `tokens.ts`)
- `apps/api/src/admin/admin.controller.ts`, `apps/api/src/admin/admin-users.service.ts`
- `apps/web/src/app/admin/users/`, and the login page
- `apps/api/prisma/schema.prisma` and a migration for reset tokens (`prisma migrate dev`)

## ADRs to read
- ADR-0008 (local accounts), ADR-0048 (failed passwords slow the source), ADR-0081 (TOTP and recovery codes),
  ADR-0087 (setup token).
- **A new ADR is needed**: account recovery by admin link and by email.
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] A locked-out user gets back in through an admin link, without the CLI.
- [ ] With SMTP set, Forgot password works end to end, and the response does not reveal whether an account exists.
- [ ] A link expires, works once, and is audited.
- [ ] A reset ends the user's other sessions.

## Tests
- API: e2e for the admin reset, the self-service reset with a fake SMTP, expiry, reuse, the rate limit, the
  no-enumeration response, and sessions ending.

## Open questions
- None.
