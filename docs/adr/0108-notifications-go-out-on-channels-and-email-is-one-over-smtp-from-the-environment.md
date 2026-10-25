# ADR-0108: Notifications go out on channels, and email is one, over SMTP from the environment

Status: accepted · Date: 2026-10-25 ·
Spec: [`docs/specs/card-404-email-notifications-over-smtp-from-env-i.md`](../specs/card-404-email-notifications-over-smtp-from-env-i.md) ·
Relates to: [spec 22](../specs/22-notifications-and-telegram.md), [ADR-0096](0096-a-cards-demo-video-goes-to-telegram-as-a-notification-with-merge-and-feedback.md), [ADR-0014](0014-server-originated-events-live-in-events.md) ·
Card: C-404 (stack S-16, stage 1)

## Context

Spec 22 built notifications for two places: the in-app feed and a linked
Telegram chat. A person who is not in the app and does not use Telegram learns
nothing — in particular that a card's worker waits for their answer. The
password-reset card (C-402) needs to send an email too, and the Slack card
(C-405) adds another place a notification can go. Both expect one rule for
how a new place joins the pipeline rather than a decision per place.

Constraints:

- A self-hosted install already configures itself through the API's
  environment (`apps/api/.env`, `api.env` in the compose install). An SMTP
  server is infrastructure, like the database, not something an admin edits in
  the app.
- SMTP credentials are a secret. The API must never return them, log them or
  put them in an error a person reads.
- An email per event is too much for kinds that come often. People asked for
  one email a day of what waits on them and what was done.

## Decision

1. **A notification is written once and delivered on channels.** The writer
   decides the recipients (spec 22 D2), applies their rules and mutes (D3) and
   folding (D6), and writes one `notifications` row per person. Every place
   outside the app is a channel with its own row per notification in
   `notification_deliveries` (`channel`, `status`, attempts, backoff,
   `lastError`) and its own sender that claims due rows. The in-app feed is the
   row itself. Telegram (spec 22) and email (this ADR) are channels; Slack
   (C-405) is added the same way: a `NotificationDeliveryChannel` value, a
   per-kind rule field, a sender, and no change to recipients, mutes or
   folding. A kind's spec (`NOTIFICATION_KIND_SPECS`) says which channels it
   may use; a muted notification gets its delivery rows as `skipped: muted`,
   never sent. A folded notification gets no new delivery on any channel: the
   first one already told the person.
2. **Email is configured by `SMTP_URL`, nothing else.** `SMTP_URL`
   (`smtp://` with STARTTLS when offered, or `smtps://`) and an optional
   `SMTP_FROM` are read at start-up. They are never stored in the database.
   Without `SMTP_URL` email is off everywhere: the writer creates no email
   rows, the sender does nothing, the Email column is hidden and the admin
   test send answers 409 `email_not_configured`. `MailService` (`src/mail/`)
   is the API's one sender and is exported for other modules (C-402's reset
   links). Admin › Integrations › Email shows the server's host, port, TLS
   mode, sender, queue and last error — never the user or password — and sends
   a test email to the admin's own address. A failure is reported with the
   server's reply code and text, with the credentials removed.
3. **Email is a mode per kind: off, immediately or daily digest.** It is not a
   switch like Telegram because the same kind can be wanted at once by one
   person and once a day by another. `notification_rules.email` stores the
   mode; null means never chosen. An `immediate` email is a `pending` delivery
   sent on the next pass (10 s), retried with backoff (30 s doubling, 5
   attempts) on a temporary SMTP reply and failed at once on a permanent
   (5xx) one. A `digest` email is a `digested` delivery from the start.
4. **The creator of a card is emailed about it by default.** For a card kind
   whose spec has an `ownerEmail`, a person who never chose a mode gets that
   mode for cards they created, and no email for other cards: `card.waiting`
   emails its owner immediately, `card.finished` goes into the owner's digest.
   Other people opt in under Account › Notifications. Choosing a mode applies
   it to every card; going back to the default restores "my cards only". Every
   other kind has no default email.
5. **The digest is per person, once a day.** Each person picks the digest
   time and IANA zone (`notification_email_settings`, default 09:00 UTC). When
   that time has passed, everything `digested` for them and written up to it
   goes out as one email, grouped into what waits on them (questions, approvals)
   and what was done. `lastDigestAt` records the occurrence, so the digest is
   sent once per day however often the job runs and on however many API
   instances (claims run under an advisory lock with a lease). An empty digest
   is not sent. A changed time applies from the next occurrence.
6. **Email links need `APP_URL`.** Each email links to the item and to the
   notification settings when `APP_URL` is set, and carries no links
   otherwise. Only a stored link that is a path in the app is turned into a
   URL.

## Consequences

- With `SMTP_URL` set, a card's creator learns that its worker waits for them
  without opening the app or linking Telegram.
- C-402 sends its reset email through `MailService` and checks
  `MailService.configured` before it offers self-service reset.
- C-405 adds Slack as a channel without a new ADR: a channel value, a rule
  field and a sender.
- Changing the SMTP server is an environment change and an API restart, as
  for the database. There is no way to set it from the app.
- An email address is the person's sign-in address; there is no separate
  notification address yet.
- Rejected:
  - **SMTP settings stored in the database and edited in Admin.** It would put
    a second secret store next to `APP_ENCRYPTION_KEY`'s and let a leaked
    admin session redirect every email. The environment is where the install's
    other infrastructure lives.
  - **An email switch like Telegram plus one global digest setting.** It
    cannot say "this kind at once, that one in the digest", which is what the
    card asks for.
  - **One digest time for the whole instance.** People in different zones
    would get it at night; the person chose per-person times.
