# C-484: Add a CLI that gives a locked-out admin a one-time recovery link

## Why
Without SMTP, the only admin who loses 2FA can get back in only by editing the database (ADR-0113 Consequences).

## What
- bun run admin:recover --email (node dist/src/cli/admin-recover.js in the image) prints a one-time link via PasswordResetService; active admins only; audited.

## Done when
- e2e: link works once; non-admin and unknown email refused.
- Troubleshooting entry.

Evidence: apps/api/src/cli/; apps/api/src/auth/password-reset.service.ts:89; ADR-0113 Consequences

Spec: docs/specs/card-484-cli-recovers-the-last-admin.md
