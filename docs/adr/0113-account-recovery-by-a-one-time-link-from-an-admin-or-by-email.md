# ADR-0113: Account recovery by a one-time link, from an admin or by email

Status: accepted · Date: 2026-10-26 ·
Spec: [`docs/specs/card-402-password-and-2fa-reset-an-admin-reset-li.md`](../specs/card-402-password-and-2fa-reset-an-admin-reset-li.md) ·
Relates to: [ADR-0048](0048-failed-passwords-slow-the-source-never-lock-the-account.md), [ADR-0081](0081-totp-two-factor-sign-in-with-hashed-recovery-codes.md), [ADR-0108](0108-notifications-go-out-on-channels-and-email-is-one-over-smtp-from-the-environment.md) ·
Amends: [ADR-0081](0081-totp-two-factor-sign-in-with-hashed-recovery-codes.md) §9 (the web's Reset 2FA gives a link) ·
Card: C-402 (stack S-16, stage 2)

## Context

A person who forgot their password, or lost both the authenticator and the
recovery codes, could get back in only through a database edit or an admin
turning their two-factor sign-in off (ADR-0081 §9) — and that still left the
password. An admin cannot set someone else's password, and should not know it.
C-404 gave the API a mail sender (`MailService`, ADR-0108), so a server with
SMTP can also reach a person who cannot sign in.

Constraints:

- A recovery link is a credential: whoever holds it owns the account. It must
  not be readable from the database, a log or a `Referer` header.
- Forgot password is a public form. It must not tell a stranger which
  addresses have accounts, and it must not become a way to flood a mailbox or
  to lock someone out.
- ADR-0048: failures slow their source down; an account is never locked.
- Two-factor sign-in must not be bypassed by whoever can read the mailbox.

## Decision

1. **A reset is a one-time link, stored hashed.** `password_reset_links` holds
   the SHA-256 of a 32-byte random token (`generateToken`), its `kind`, where it
   came from (`via`: `admin` or `email`), who created it, `expiresAt` and
   `usedAt`. The token is shown or sent once and never stored. The link is
   `/reset-password#token=…`: the token is in the fragment, so the page request
   does not carry it; the page posts it to the API. An admin's link lasts 24
   hours (it is handed over by hand), an emailed one an hour. A new link of the
   same origin replaces the person's unused ones; an emailed link never
   replaces an admin's, so a stranger's Forgot password cannot void the link an
   admin just gave.
2. **Two kinds.** `password` sets a new password; on an account with
   two-factor sign-in it also needs a TOTP or recovery code, counted under the
   login wait (ADR-0081 §6), so access to the mailbox is not enough. `two_factor`
   sets a new password and turns two-factor sign-in off (secret and recovery
   codes deleted), so the person enrols again under Account; only an admin
   creates it, for an account that has two-factor sign-in. It needs no code and
   no `APP_ENCRYPTION_KEY`, so it also recovers accounts after the key was lost.
3. **Admin › Users gives links.** `POST /admin/users/:id/reset-link`
   (`{ kind }`, admins, session only — an API token cannot mint one) answers the
   path and expiry once; the web shows `origin + path` in a dialog after a
   confirmation. Only an active account other than the admin's own can get one.
   It is audited as `user.reset_link` with the kind and expiry. The web's
   Reset 2FA now gives a `two_factor` link instead of calling
   `DELETE /admin/users/:id/two-factor`, which stays for API clients: nothing
   changes for the person until they use the link.
4. **Self-service only with email.** `GET /auth/password-reset` says whether
   Forgot password is offered: `SMTP_URL` and `APP_URL` are both set. Without
   them the sign-in page says to ask an administrator and
   `POST /auth/password-reset/request` answers 409 `password_reset_unavailable`.
   With them it answers 202 for any address, after the same work, and sends the
   email in the background: the status, the body and the time do not depend on
   whether the account exists. An active account gets at most one emailed link
   a minute, decided under a per-account advisory lock; other addresses get
   nothing. Each request is audited, folded per minute, as
   `auth.password_reset_request` against the address.
5. **Rate limits follow ADR-0048.** Every route has the per-IP request limit of
   login. Requests count on the login wait under `password-reset:<email>` per
   (address, IP); after five in the window the source waits (429 with
   `Retry-After`), the account's own sign-in is untouched. A missing, used or
   expired token counts under one key per IP (`password-reset-link`), so token
   guessing slows down the same way; all three answer 410 `reset_link_invalid`
   and are audited as a denied reset.
6. **Using a link ends every other session and signs the person in.** In one
   transaction the link is marked used only if it is still unused and unexpired
   (a second use answers 410), the person's other unused links are deleted,
   every session is deleted, two-factor sign-in is turned off for a
   `two_factor` link, and the password is replaced. The login wait for the
   address is cleared, a new session is issued, and `auth.password_reset` is
   audited with the kind, origin and link.

## Consequences

- A locked-out person gets back in through an admin's link without the CLI or
  the database; losing everything as the only admin still needs the database.
- With SMTP and `APP_URL` set, a person recovers without an admin, and the form
  reveals nothing about which addresses have accounts.
- An admin who creates a link can use it themselves. That power already exists
  (an admin can delete or disable the account); the audit record names who
  created each link.
- The reset email is sent outside `notification_deliveries`: it goes to one
  address, at once, and is not a notification a person can mute.
- Rejected:
  - **An admin sets a temporary password.** The admin would know a credential
    of someone else's account, and a temporary password lives on until changed.
  - **A short numeric code by email instead of a link.** It needs its own
    guessing limit per account, which ADR-0048 rules out, and gives no gain for
    a person who can open the email.
  - **Emailed links that also reset two-factor sign-in.** Whoever reads the
    mailbox would own the account; the second factor exists for that case.
  - **Answering 404 for unknown addresses.** It lets anyone list accounts.
