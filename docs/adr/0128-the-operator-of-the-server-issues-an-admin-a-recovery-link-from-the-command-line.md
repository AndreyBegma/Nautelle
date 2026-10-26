# ADR-0128: The operator of the server issues an admin a recovery link from the command line

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-484-cli-recovers-the-last-admin.md`](../specs/card-484-cli-recovers-the-last-admin.md) ·
Relates to: [ADR-0008](0008-local-accounts-with-admin-approved-registration.md), [ADR-0081](0081-totp-two-factor-sign-in-with-hashed-recovery-codes.md), [ADR-0087](0087-the-first-admin-is-created-in-the-browser-with-a-one-time-setup-token.md) ·
Amends: [ADR-0113](0113-account-recovery-by-a-one-time-link-from-an-admin-or-by-email.md) Consequences (the only admin no longer needs the database) ·
Card: C-484 (stack S-20, stage 1)

## Context

ADR-0113 lets an admin give any other account a one-time recovery link, and
lets a server with SMTP email one. An instance without SMTP whose only admin
loses the password, or the authenticator and the recovery codes, has no other
admin to ask, so ADR-0113 and ADR-0081 both name the database edit as the only
way back in. Editing `users` by hand is error prone and leaves no audit record.

## Decision

1. **`admin:recover` prints an admin's recovery link.** `bun run admin:recover
   -- --email <e> [--kind password|two_factor]`, or `node
   dist/src/cli/admin-recover.js …` in the image, prints the link to stdout and
   nothing else. The kind defaults to `two_factor`, since the second factor is
   what an admin loses (ADR-0081).
2. **It is `PasswordResetService`'s own link.** The command calls
   `issueByCli`, which shares `issueAdminLink` with the admin route, so the
   token, its SHA-256 storage, the 24 h lifetime, single use and the
   consequences of using it (ADR-0113 §6) are the same code, not a copy. There
   is no HTTP route for it.
3. **Active admins only.** An unknown email, a non-admin account or an account
   that is not active is refused with a message on stderr and a non-zero exit;
   nothing is issued and nothing is audited. The command is therefore not a
   back door into ordinary accounts, which an admin recovers from Admin ›
   Users.
4. **Container access is the authority.** Whoever can run commands in the API
   container already reads the database and the environment keys, so the
   command asks for no password and no code. The audit record, `user.reset_link`,
   names the system as the actor and carries `meta.via: 'cli'`, so a link issued
   from the command line is told apart from one an admin issued in the web
   (ADR-0008: everything is audited).

## Consequences

- The only admin recovers without SMTP and without touching the database. The
  limitation in ADR-0113 and ADR-0081 is gone.
- The link sits in the terminal's scrollback. It is single use and lives 24 h,
  the same exposure as an admin pasting it into a chat.
- The command starts a small Nest context (database, audit, settings, mail),
  not the application: no scheduled jobs and no web server.
- Rejected:
  - **A `--force` flag for non-admin accounts.** An admin already does that in
    the web, with a named actor in the audit record; the command adds nothing
    there except a way past the roles.
  - **Resetting the password from the command line.** The operator would know
    a credential of an account; a link keeps it unknown, as in ADR-0113.
  - **Calling the HTTP route with a service credential.** It needs a session
    admin, which is the person who is locked out.
