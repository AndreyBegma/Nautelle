# C-484: A CLI command gives a locked-out last admin a recovery link

Stack **S-20**, stage 0.

## Summary
An admin can recover any other account with a one-time link (ADR-0113). Without SMTP, though, the only admin, or every admin at once, can only get back in by editing the database by hand. ADR-0113 Consequences says so: "losing everything as the only admin still needs the database". This card adds a CLI command that issues the same one-time link from inside the API container.

## Scope
**In:** a new command in `apps/api/src/cli/`, the script in `apps/api/package.json`, and the troubleshooting docs.
**Out:** any HTTP route, and changing what a link does.

## Current behaviour
- [Confirmed] `apps/api/src/cli/` holds `admin-create.ts` and `create-admin.ts` (`bun run admin:create`, `apps/api/package.json:16`), which create an admin and refuse an existing email.
- [Confirmed] `apps/api/src/auth/password-reset.service.ts:89` `issueByAdmin(…, kind: PasswordResetKind, …)`, where kinds are `password` and `two_factor` (`packages/shared/src/auth/password-reset.ts:9`). An admin link lives 24 h (`:17`).
- [Confirmed] The image ships compiled code and starts with `node dist/src/main` (`apps/api/Dockerfile:94`), so the CLI runs as `node dist/src/cli/<name>.js`.

## Decisions
- `bun run admin:recover -- --email <e> [--kind password|two_factor]`, also `node dist/src/cli/admin-recover.js …` in the container. It prints the link once to stdout and nothing else.
- It reuses `PasswordResetService`'s link creation, with no second implementation. The actor is `system`, recorded as `user.reset_link` (`packages/shared/src/audit/actions.ts:35-36`) with `meta.via: 'cli'` (ADR-0008: everything is audited).
- It works for any **active admin** account and refuses others ("Use Admin › Users for other accounts"), so it is not a back door into ordinary accounts.
- Access to the container is the authority (recorded in [ADR-0128](../adr/0128-the-operator-of-the-server-issues-an-admin-a-recovery-link-from-the-command-line.md)). Whoever can run commands in the API container can already read the database.
- `--kind two_factor` is the default, since 2FA is what an admin loses (ADR-0081). `password` is for a forgotten password.

## Acceptance criteria
- [x] `admin-recover.e2e.spec.ts`: for an active admin it prints a link that resets 2FA once and is refused a second time. It writes the audit record.
- [x] `admin-recover.e2e.spec.ts`: an operator's email or an unknown email exits non-zero with a message and issues nothing.
- [x] `apps/docs/src/content/docs/operations/troubleshooting.md` has a "Locked out as the only admin" entry with the `docker compose exec api node dist/src/cli/admin-recover.js --email …` line.
- [x] No web UI, so no demo.

## Risks
- The link is in the terminal's scrollback. It is single use and lives 24 h, which is the same exposure as an admin pasting it into a chat.

## Open questions
- None.
