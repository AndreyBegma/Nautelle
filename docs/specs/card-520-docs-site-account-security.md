# C-520: Docs site — account security: two-factor sign-in, reset links, personal API tokens

Stack **S-21 "Docs match the product"**, stage 1 (after C-515). Part of the 2026-10-26 improvement plan.

## Summary
Two-factor sign-in, account recovery and personal API tokens shipped (v0.18.0 and earlier) with no user-facing
page. Write one page for people and admins.

## Scope
**In:** `apps/docs/src/content/docs/using/account-security.md` (frontmatter `sidebar.order: 3`).
**Out:** the sidebar config, other pages, app code.

## Current state
- [Confirmed] Two-factor sign-in: TOTP, set up under Account (key and `otpauth://` link, no QR), ten recovery codes
  shown once, turning it off needs password and code, optionally required of admins
  (`auth.two_factor.required_for_admins`), needs `APP_ENCRYPTION_KEY` (ADR-0081 §1–8, §11;
  `apps/web/src/app/account/two-factor-card.tsx`; `configuration/environment.md:45`).
- [Confirmed] Recovery: Admin › Users gives a one-time `password` or `two_factor` link (24 h); with `SMTP_URL` and
  `APP_URL` set, **Forgot password** emails a `password` link (1 h); a `password` link on a 2FA account still asks
  for a code; a `two_factor` link turns 2FA off for re-enrolment (ADR-0113 §1–3; pages
  `apps/web/src/app/forgot-password/`, `apps/web/src/app/reset-password/`).
- [Confirmed] Personal API tokens: `ntl_…`, shown once, act as their owner with the owner's current role, optional
  read-only, refused on session-only routes (`403 api_token_not_allowed`), managed in Account and, for admins,
  Admin › Users (ADR-0104 §1–5; `apps/web/src/app/account/api-tokens-card.tsx`,
  `apps/web/src/app/admin/users/api-tokens-card.tsx`).

## What
Sections: **Two-factor sign-in** (turn on, recovery codes, turn off, admins required) · **Locked out?** (lost
password; lost phone and codes; what an admin does; email vs admin link lifetimes) · **Personal API tokens**
(create, read-only, what a token cannot do, revoke; a `curl -H "Authorization: Bearer ntl_…"` example against
`<NAUTELLE_URL>/api/auth/me`).

## Acceptance criteria
- [ ] `bun run --cwd apps/docs build` passes; the page is third under **Using Nautelle**.
- [ ] Lifetimes, prerequisites and refusals match ADR-0081, ADR-0104 and ADR-0113.
- [ ] The `curl` example works against a dev instance (`GET /auth/me` accepts a token, ADR-0104 §5).
- [ ] `bun run check` passes. No app UI change, so no demo.
