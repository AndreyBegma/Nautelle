---
title: Account security
description: Two-factor sign-in, recovery codes, what to do when you are locked out, and personal API tokens.
sidebar:
  order: 2
---

This page covers what protects your own account: two-factor sign-in, getting
back in when you are locked out, and personal API tokens for scripts. All of it
lives under **Account**, except the admin's reset links, which are under
**Admin › Users**.

## Two-factor sign-in

With two-factor sign-in on, sign-in asks for a code from an authenticator app
after your password. A stolen password alone no longer opens the account.

### Turn it on

1. Open **Account › Two-factor sign-in**, enter your password and press
   **Set up**.
2. Add the key shown to your authenticator app, or use **open it in the app** on
   the same device. Nautelle shows the key and an `otpauth://` link, not a QR
   code.
3. Enter the six digits the app shows and press **Turn on**.

Turning it on signs your other sessions out. Nautelle uses the standard
settings every authenticator app supports: six digits, a new code every 30
seconds. A code works once: the next one is the next step of the clock.

If the server has no `APP_ENCRYPTION_KEY`, setup and signing in with a code
answer `two_factor_unavailable` (503); accounts without two-factor sign-in are
not affected.

### Recovery codes

Turning it on shows ten recovery codes, once. Save them somewhere other than
your phone. Each code signs you in once, in place of the six digits. Account
shows how many you have left. **New recovery codes** (password and a code)
replaces the whole set.

### Turn it off

**Turn off** on the same card needs your password and a code from the app or a
recovery code.

### Required for administrators

An admin can require two-factor sign-in of every administrator (the setting
`auth.two_factor.required_for_admins`, off by default). An administrator without
it can still sign in but reaches nothing except Account until they set it up;
the API answers `two_factor_setup_required` (403). While the requirement is on,
an administrator cannot turn their own two-factor sign-in off.

## Locked out?

If you forgot your password, or lost both your phone and your recovery codes,
you recover with a **one-time reset link**. Nobody sets your password for you,
and an admin never learns it.

| Link | Comes from | Lasts |
|---|---|---|
| Admin link | **Admin › Users › Reset password** or **Reset 2FA** | 24 hours |
| Emailed link | **Forgot password** on the sign-in page | 1 hour |

A link works once. Using it ends every other session of yours and signs you in
with the new password. A newer link replaces your unused ones of the same
origin, but an emailed link never replaces an admin's.

### Forgot password (email)

**Forgot password** only works when the server can send email (`SMTP_URL` and
`APP_URL` are set). Otherwise the sign-in page tells you to ask an
administrator. The form answers the same for any address, so it does not reveal
who has an account, and at most one email a minute is sent per account. Too many
requests make that source wait (429); your own sign-in is not locked.

If your account has two-factor sign-in, an emailed link also asks for a code
from the app or a recovery code, so access to your mailbox is not enough. If
you have neither, ask an administrator for a 2FA link.

### The 2FA link (from an admin)

An administrator opens **Admin › Users**, chooses **Reset 2FA** for your account
and confirms. Nautelle shows a link once; the administrator hands it to you. You
open it, choose a new password, and your two-factor sign-in is turned off with
its recovery codes. It needs no code. Enrol again under **Account** afterwards.

An administrator can also use **Reset password** to give a password link, and
cannot create a link for their own account or for a disabled one.

### When a link does not work

A link that is unknown, already used or expired answers 410
(`reset_link_invalid`). Ask for a new one. Repeated bad tokens from one address
slow that address down.

If you are the only administrator and lose everything, the database is the last
resort: clear the `totp*` columns of your row in `users`.

## Personal API tokens

A token lets a script or CI call the REST API without a browser login. Manage
them under **Account › API tokens**.

### Create one

Give it a name, an access level, and an expiry (7, 30, 90 or 365 days, or
never). You can limit it to some projects. The token starts with `ntl_` and is
shown **once**; Nautelle keeps only its hash.

- **Your rights** acts as you, with your *current* role and project
  memberships. If your role is lowered, so is the token at once. If your account
  is disabled, the token is refused.
- **Read-only** may only read: any method other than `GET`, `HEAD` and
  `OPTIONS` is refused with `api_token_read_only` (403).

A token limited to projects reaches only those projects, the project list and
`GET /auth/me`. Other instance-wide routes answer `api_token_project_scoped`
(403); use a token for every project when a script needs them.

### Call the API

```bash
export NAUTELLE_TOKEN='paste the token you copied when you created it'
curl -H "Authorization: Bearer $NAUTELLE_TOKEN" https://nautelle.example.com/api/projects
```

`NAUTELLE_TOKEN` is a variable you set yourself: paste the token shown once at
creation, or load it from your CI's secret store so it never lands in a script
or a repository. Use your instance address; behind the web app the API is under
`/api`. No cookie and no CSRF header are needed.

### What a token cannot do

A token cannot create or change a way to sign in as you. These routes need a
browser session and answer `api_token_not_allowed` (403):

- everything under `/auth` except `GET /auth/me`: password, two-factor sign-in,
  sessions, sign-out;
- token management, yours and the admin's, so a token cannot mint another;
- linking a Telegram chat;
- opening a terminal.

### Revoke

Press **Revoke** next to the token and confirm. It is refused from the next
request and this cannot be undone. The list shows each token as active, expired
or revoked, with its last use. An administrator can revoke anyone's tokens from
**Admin › Users**. Every use is in the audit log as your email "via token
`<name>`".
