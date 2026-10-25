# ADR-0104: Personal API tokens act as their owner, never above the owner's current role

Status: accepted · Date: 2026-10-25 ·
Card: C-403 ·
Spec: [`docs/specs/card-403-personal-api-tokens-the-owner-s-rights-o.md`](../specs/card-403-personal-api-tokens-the-owner-s-rights-o.md) ·
Amends: [spec 3](../specs/3-auth-and-access.md) D7 ·
Relates to: [ADR-0081](0081-totp-two-factor-sign-in-with-hashed-recovery-codes.md), [spec 8](../specs/8-audit-log.md)

## Context

The REST API accepted only a browser session: the `ad_session` cookie plus a
double-submit CSRF header on every write (spec 3 D5, D7). Scripts and CI that
want to list or run cards had to replay a browser login, which also carries the
password and any two-factor sign-in. The card asks for personal API tokens: a
name, a scope (the owner's rights, or read-only), an optional project list and
an expiry; shown once, stored hashed, revocable by the owner and by an admin,
and every use attributed to the owner in the audit log.

## Decision

1. **Format and storage.** A token is `ntl_` followed by 32 random bytes in
   base64url. The prefix makes a leaked token recognisable in a scan and
   separates it from a runner's bearer token. The database stores its SHA-256
   (`api_tokens.tokenHash`) and a hint — the first 10 characters — to tell
   tokens apart. The token itself is in the create response only.
2. **Authentication.** `Authorization: Bearer ntl_…` authenticates a request in
   `SessionGuard` as the token's owner. The owner is read on every request, so
   the token carries the owner's *current* role and project memberships: a
   lowered role lowers the token at once, and a disabled owner's token is
   refused (401) like an unknown, expired or revoked one. A token has no role
   of its own and can never exceed its owner's.
3. **Read-only.** A `read_only` token is refused every method other than `GET`,
   `HEAD` and `OPTIONS` (403 `api_token_read_only`), before any handler runs.
4. **No CSRF for tokens.** A request authenticated by a token skips the CSRF
   check: CSRF defends ambient cookies, and a cross-site page cannot set
   `Authorization`. A request with a cookie and no token keeps spec 3 D7.
5. **Session-only routes.** The rule: a route that creates, changes or removes
   a way to sign in or to act as the token's owner needs a browser session.
   `@SessionOnly()` routes refuse a token (403 `api_token_not_allowed`). They
   are:
   - every `auth/*` route except `GET /auth/me` — password, two-factor
     sign-in, sessions, sign-out;
   - `auth/api-tokens` and `admin/api-tokens` — token management for the
     owner and for an admin;
   - `notifications/telegram/link` (every method) — a linked Telegram chat
     signs in the Mini App (`POST /auth/telegram`) with a browser session, so
     a token that could link a chat could turn itself into a session that
     outlives its revoke;
   - `POST /terminal/tickets` — a ticket is bound to the browser session that
     asked for it, and the terminal socket checks that cookie.

   A token therefore cannot mint a wider token, change the password or
   two-factor sign-in, list sessions, or open a sign-in path of its own. A new
   route that issues a credential for the owner must carry `@SessionOnly()`.

   Not session-only, because they are the owner's rights rather than a way to
   sign in as the owner: an admin's instance credentials (runner pairing codes,
   inbound trigger secrets, outbound webhooks, the GitHub App) and an admin's
   management of other accounts (approve, role, status, resetting another
   user's two-factor sign-in; an admin cannot reset their own). An admin token
   limited to projects reaches none of them (point 6).
6. **Project list.** A token limited to projects narrows
   `ProjectAccessService`: `resolve` answers null (404) for a project outside
   the list, and `visibleWhere` adds the list as an `AND` term. Because many
   instance-wide services bypass project membership for an admin, a limited
   token is also refused (403 `api_token_project_scoped`) on every route that
   did not pass `ProjectAccessGuard`, except routes marked
   `@ProjectScopedTokenAllowed()` that narrow through `ProjectAccessService`
   (`GET /auth/me`, `GET /projects`). This check is fail-closed: a new
   instance-wide route is refused until someone opens it on purpose.
7. **Audit.** Every audit record written for a token request carries
   `meta.apiToken = { id, name }` next to the origin. The audit page names the
   actor "`<email>` via token `<name>`". Creating and revoking a token are
   audited (`auth.api_token_create`, `auth.api_token_revoke`); an admin
   revoking another user's token records the owner in `meta.ownerId`.
8. **Revoke keeps the row.** Revoking sets `revokedAt` and `revokedById`;
   the list shows each token as active, expired or revoked with its last use
   (`lastUsedAt`, `lastUsedIp`, refreshed at most once a minute or when the
   address changes). Deleting a user deletes their tokens.

## Consequences

- Scripts call the API with `curl -H 'Authorization: Bearer …'` and no cookie.
- A token limited to projects reaches only project routes, the project list
  and `GET /auth/me`; a script that needs instance-wide routes uses a token for
  every project.
- A leaked token is as strong as its owner until it expires or is revoked; an
  admin can revoke any user's tokens from Admin › Users.
