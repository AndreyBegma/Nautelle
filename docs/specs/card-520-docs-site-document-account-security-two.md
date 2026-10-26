# C-520: Docs site: document account security — two-factor sign-in, reset links, API tokens

## Why
Two-factor sign-in (ADR-0081), one-time reset links from an admin or by email (ADR-0113) and personal API tokens (ADR-0104) shipped without a user page; a locked-out person has nowhere to look.

## What
- One page under Using Nautelle: turning 2FA on and off, recovery codes, required-for-admins; Locked out? (admin link 24 h, emailed link 1 h, the 2FA link); personal tokens (read-only, what they cannot do, revoke) with a curl example.

## Done when
- Docs build passes; lifetimes and refusals match the ADRs; the curl example works on a dev instance. No demo.

Evidence: ADR-0081, ADR-0104, ADR-0113; apps/web/src/app/account/two-factor-card.tsx, api-tokens-card.tsx

Spec: docs/specs/card-520-docs-site-account-security.md
