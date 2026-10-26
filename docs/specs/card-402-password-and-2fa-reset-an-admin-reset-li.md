# C-402: Password and 2FA reset: an admin reset link, and self-service reset when SMTP is set

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
There is no "forgot password" flow and no admin reset; only `PATCH auth/me/password` and the `admin:create` CLI.

## What
- Admin › Users: **Reset password** and **Reset 2FA**, each giving a one-time link (expires, single use, audited). The user sets a new password (and re-enrols 2FA).
- With SMTP configured (team-email card), **Forgot password** on the login page sends the same kind of link by email; without SMTP the login page says to ask an admin.
- Rate-limited; tokens hashed.

## Done when
A locked-out user gets back in without the CLI. e2e for expiry, reuse and rate limits.

Spec: docs/specs/card-402-password-and-2fa-reset-an-admin-reset-li.md (PR #937)
