---
title: Notifications
description: What Nautelle notifies you about, and how the bell, Telegram, email and Slack deliver it.
sidebar:
  order: 2
---

Nautelle tells you when something needs you or has happened: a card's worker
asks a question, a round fails, a budget runs out. Each event becomes a
notification of one **kind**, and a kind can reach you in the app, in Telegram
and by email. A team can also follow its cards in a Slack channel.

This page covers what is notified, who sets up which channel, and how rules and
mutes shape what you receive. The environment variables are listed once, on
[Environment variables](../../configuration/environment/); this page links them
instead of repeating them.

## Who sets up what

| Channel | Where it goes | Who sets it up | Needs |
|---|---|---|---|
| In-app bell and feed | You | Nobody: always on | Nothing |
| Telegram | Your linked chat | An admin adds the bot; each person links their chat | `APP_ENCRYPTION_KEY` |
| Email | Your sign-in address | The operator of the install, in the API's environment | `SMTP_URL`, optionally `SMTP_FROM` |
| Slack | A channel | A project admin (one project) or a workspace admin (everything else) | `APP_ENCRYPTION_KEY` |

Links in Telegram messages, emails and Slack messages open Nautelle at
`APP_URL`. Without it, emails carry no links.

## Kinds

A notification goes to the people the kind is about. A project kind reaches the
members of that project, an admin kind reaches active admins, and an account
kind reaches only the person it concerns. Some kinds skip viewers, and a few
reach admins or operators only.

| Kind | Sent when | Scope | Channels |
|---|---|---|---|
| A person is needed | The orchestrator asks a question. | Project | In-app, Telegram, email |
| Slot blocked | A slot reports a blocked checkpoint. | Project | In-app, Telegram, email |
| Pane is waiting for input | A slot's pane waits for a yes or no. | Project | In-app, Telegram, email |
| Quota reached | A slot hit its usage limit. | Project | In-app, Telegram, email |
| Queue is empty | A project has no issue left to dispatch. | Project | In-app, Telegram, email |
| Pull request awaiting approval | A pull request waits for your approval. | Project | In-app, Telegram, email |
| Runner offline | A runner went offline. | Admins | In-app, Telegram, email |
| Runner back online | A runner that was offline is back. | Admins | In-app |
| Runner connection replaced | Another connection took over a runner's token, which may mean it was stolen. | Admins | In-app, Telegram, email |
| Budget exceeded | A budget was spent in full. | Project | In-app, Telegram, email |
| Budget threshold reached | A budget crossed one of its thresholds. | Project | In-app, Telegram, email |
| Schedule disabled | A schedule was turned off automatically. | Project admins | In-app, Telegram, email |
| Action requested | A session asks to start the orchestrator. | Project | In-app, Telegram, email |
| Board card finished | A card's worker finished. | Project | In-app, Telegram, email |
| Card worker is waiting for you | A card's worker waits for your answer. | Project | In-app, Telegram, email |
| Card worker stuck on its own background task | A card's round waited too long on a background task. | Project | In-app, Telegram, email |
| Card worker paused by a hard budget | Nautelle paused a running round because a hard budget was reached. | Project | In-app, Telegram, email |
| Demo video of a card ready or failed | A card's demo video became ready or failed. | Project operators and admins | Telegram |
| Card round failed | A card's round failed. It names the card, never the error. | Project | In-app, Telegram, email |
| Card pull request merged | A card's pull request merged. | Project | In-app, Telegram, email |
| Cards suggested from your sessions | Card capture found cards worth creating. | Project operators and admins | In-app, Telegram, email |
| Steward needs you on stuck work | The steward escalated an incident. | Project operators and admins | In-app, Telegram, email |
| Sign-in attempts throttled | An account had too many failed password checks from one source. | Admins | In-app, Telegram, email |
| Telegram chat waits for your confirmation | A chat redeemed your link code. | You only | In-app |

The demo video kind is sent only while the project's Telegram demo setting is
on.

## The bell and the feed

The bell in the top bar shows how many notifications are unread and opens the
latest ones. A new notification updates the count without a reload. **See all**
opens **Account → Notifications**, where the feed has All and Unread tabs and
you can mark items read.

The bell is for information. What waits on a decision of yours is the
[Inbox](../inbox-and-away-mode/), which lists those items by their condition
and not by the notification.

A burst of the same kind for the same project and slot within 15 minutes is
folded into one notification with a count, so a flapping slot does not fill
the feed. A fold makes the item unread again but sends nothing new to
Telegram or email.

## Telegram

An admin adds the bot once under **Admin → Integrations → Telegram** by pasting
a bot token from Telegram's BotFather. The token is checked, stored sealed with
`APP_ENCRYPTION_KEY` and never shown again. Without that key the token is
refused.

Each person then links their own chat under **Account → Notifications →
Telegram**: you get a link, open it in Telegram, and the chat is linked. When a
chat redeems your code you also get an in-app notification asking you to
confirm it, so a leaked code cannot link a stranger's chat. Until you link a
chat, the Telegram column of your rules is disabled.

Telegram messages are limited to 20 per person per 10 minutes. Beyond that,
messages wait and go out as one digest message.

The Telegram variables (`TELEGRAM_POLL_TIMEOUT_S`, `TELEGRAM_API_BASE`,
`TELEGRAM_INIT_DATA_MAX_AGE_S`) are listed on
[Environment variables](../../configuration/environment/).

## Email

Email is switched on by the operator of the install with `SMTP_URL` and,
optionally, `SMTP_FROM` in the API's environment. They are read at start-up and
are never stored in the database, so changing the server means changing the
environment and restarting the API. See
[Environment variables](../../configuration/environment/) for the format.
Without `SMTP_URL` no email is sent and the Email column stays hidden.

Admins see the server's host, port, TLS mode, sender and last error under
**Admin → Integrations → Email**, never the credentials, and can send a test
email to their own address.

Email goes to the address you sign in with. In your rules, each kind has an
Email mode:

- **Off** sends nothing.
- **Immediately** sends one email as it happens.
- **Daily digest** gathers the kind into one email a day.

Out of the box, the person who created a card is emailed about it: **Card
worker is waiting for you** immediately, and **Board card finished** in the
digest. Nobody else gets email until they choose a mode, and every other kind
starts off. Choosing a mode applies it to every card, yours or not; going back
to the default restores "my cards only". The demo, runner back online and
Telegram confirmation kinds are never emailed.

You pick the digest time and time zone under **Account → Notifications →
Email**; the default is 09:00 UTC. An empty digest is not sent.

## Slack

Slack posts to a channel, not to a person, through an incoming webhook. There
is no Slack app to install. A webhook URL is a secret: whoever has it can post
to the channel, so Nautelle seals it with `APP_ENCRYPTION_KEY`, never shows it
again and only displays its last four characters. Without the key it cannot be
saved. Only Slack incoming webhook addresses are accepted.

There are two places to set one up:

- **A project webhook**, under the project's **Settings → Slack**, set by a
  project admin.
- **A workspace webhook**, under **Admin → Integrations → Slack**, set by a
  workspace admin.

A project's own webhook replaces the workspace one for that project, events
included. A project without one posts through the workspace webhook, and
removing a project webhook falls back to it.

Each webhook has a toggle per event, all on by default:

| Event | Posts when |
|---|---|
| Finished | A card is finished, with its pull request. |
| Demo | A card's demo video is ready, with a link that opens it on the Board. |
| Question | A card's worker waits for your answer. |
| Failed | A card's round fails, or its demo video fails. |
| Budget | A budget threshold or limit is reached, or a card is paused by a hard budget. |
| Merged | A card's pull request merged. |

Other kinds never go to Slack. A **Send test message** button checks the stored
webhook.

Slack ignores personal rules and mutes. The channel gets one message per event
however many people would receive it, and what it posts depends only on the
webhook's toggles. Failed deliveries are retried with a growing delay up to
five times; a revoked webhook or an archived channel fails at once. The
settings show the last delivery and its error.

## Rules and mutes

### Rules

**Account → Notifications** has a table of kinds with a switch for each
channel, and an Email mode when email is on. A kind you never touched keeps its
default, which depends on your role: many kinds are off for viewers, and a few
are off by default for everyone, such as **Queue is empty**. Telegram and
email only offer the kinds that can use them. You only see the admin kinds if
you are an admin.

Rules are yours alone. They do not change what the project's other members
receive, and they do not affect Slack.

### Mutes

A mute silences one project for you, on every channel, for as long as you set
or until you remove it. Under **Account → Notifications → Mutes** pick a
project and, optionally, an end date.

While a project is muted, its notifications are still recorded in your feed,
marked as muted, but they do not count as unread and nothing is sent to
Telegram or email. Mutes cover project kinds only: admin and account kinds are
not affected.

## Sources

- [ADR-0108](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0108-notifications-go-out-on-channels-and-email-is-one-over-smtp-from-the-environment.md):
  channels and email over SMTP.
- [ADR-0109](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0109-slack-notifications-go-through-an-incoming-webhook-per-project-or-workspace.md):
  Slack incoming webhooks.
- [Spec 22](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/specs/22-notifications-and-telegram.md):
  kinds, rules, mutes and Telegram.
