# ADR-0109: Slack notifications go through an incoming webhook per project or workspace

Status: accepted · Date: 2026-10-25 ·
Spec: [`docs/specs/card-405-slack-notifications-through-an-incoming.md`](../specs/card-405-slack-notifications-through-an-incoming.md) ·
Amends: [ADR-0108](0108-notifications-go-out-on-channels-and-email-is-one-over-smtp-from-the-environment.md) §1 (channel-scoped destinations) ·
Relates to: [ADR-0096](0096-a-cards-demo-video-goes-to-telegram-as-a-notification-with-merge-and-feedback.md), [ADR-0014](0014-server-originated-events-live-in-events.md) ·
Card: C-405 (stack S-16, stage 1)

## Context

A team follows its cards in a Slack channel, not in each person's Telegram.
The card asks for the events Telegram carries — a card finished (with its
demo), a question, a failure, a budget, a merge — posted to a channel with
links that open Nautelle. It rules out a Slack app with OAuth and interactive
buttons: an incoming webhook is the whole integration.

Two of those events did not exist as notifications: a round that failed and a
pull request that merged were activity only. Telegram therefore did not carry
them either.

An incoming webhook URL is a bearer secret: whoever holds it posts to the
channel.

[ADR-0108](0108-notifications-go-out-on-channels-and-email-is-one-over-smtp-from-the-environment.md)
§1 planned Slack as one more `NotificationDeliveryChannel`: a value in
`notification_deliveries`, a per-kind rule field and a sender, with recipients,
mutes and folding unchanged. That model is per person: a delivery row hangs on
one person's `notifications` row, and rules, mutes and folding are that
person's choices. A Slack channel is not a person. One message goes to it per
notification however many people receive the notification, including when
nobody does (a demo with `demoTelegram` off, a project with no member who
wants the kind). Hanging it on a per-person row would post it once per
recipient, or not at all, and would let one person's mute silence the whole
team's channel.

## Decision

1. **A webhook per project, and one for the workspace.** `slack_webhooks`
   holds at most one row per project (Settings → Slack, project admins) and
   one workspace row (`projectId` null, Admin › Integrations › Slack,
   workspace admins). The URL must be a Slack incoming webhook
   (`https://hooks.slack.com/…` or GovSlack, no port, credentials, query or
   fragment), so the field cannot point the API at another host. It is sealed
   with `SecretCipher` (`APP_ENCRYPTION_KEY`); without the key it cannot be
   set (`409 encryption_key_missing`). It is never returned — the API answers
   its last four characters. Setting, replacing and removing it is audited
   without the URL.
2. **A project's webhook replaces the workspace one**, events included. A
   project without its own posts through the workspace webhook; removing a
   project webhook falls back to it.
3. **Per-event toggles.** A webhook stores the events it posts:
   `finished`, `demo`, `question`, `failed`, `budget`, `merged` (all on by
   default). `slackEventFor` maps a notification kind to at most one of them:
   `card.finished` → finished; a ready `card.demo` → demo, a failed one →
   failed; `card.waiting` → question; `card.failed` → failed;
   `budget.threshold`, `budget.exceeded`, `card.paused` → budget;
   `card.merged` → merged. Other kinds never go to Slack.
4. **New kinds `card.failed` and `card.merged`, on every channel.** The API
   records the server events `card.failed` (a round failed or died at start;
   deduplicated per round) and `card.merged` (deduplicated per card and pull
   request). They become notification kinds delivered in-app, to Telegram and
   to Slack under the existing rules and mutes. The draft names the card, never
   the round's error, which can quote the pane.
5. **The outbox is fed once per notification, not per person — this amends
   ADR-0108 §1.** ADR-0108 §1 stays the rule for destinations that belong to a
   person (in-app, Telegram, email). A destination that belongs to a project
   or the workspace — a channel — is not a `NotificationDeliveryChannel`: it
   has its own outbox table, is fed once per notification before the writer
   fans out to people, and is governed by its own toggles, not by people's
   rules, mutes or folding. A replayed event still posts once: `(webhookId,
   eventId, kind)` is unique in `slack_deliveries`, which does for a channel
   what folding and the per-person dedupe do for a person. A Slack
   message belongs to a channel, so `NotificationWriter.write` queues at most
   one `slack_deliveries` row for the webhook covering the project, before it
   fans out to people, with the message parts (title, body, links as app
   paths). Links become absolute with `APP_URL` when sent, so a changed URL
   applies to queued messages. A demo recorded while the project's
   `demoTelegram` is off still reaches Slack when the webhook posts demos; it
   is flagged `telegram: false` and goes to no person.
6. **A finished card is two messages.** `finished` posts the card with its
   pull request; when its demo video is ready, `demo` posts the card, its pull
   request and a link that opens the demo on the Board. Each has its own
   toggle. No buttons: an incoming webhook cannot receive their presses.
7. **Delivery with retries.** `SlackDeliveryService` claims the oldest due row
   with `FOR UPDATE SKIP LOCKED`, leases it for one request's timeout plus a
   minute, posts it, and only then claims the next one. A row is leased only
   while it is being sent, so two API instances never post one twice, and the
   result is recorded only while the lease still holds. A 2xx is sent. A 400, 401, 403, 404 or 410 — a revoked webhook, an
   archived channel — fails at once; anything else retries with an exponential
   backoff from 30 s (or Slack's `Retry-After` on a 429, capped at an hour), up
   to five attempts. The settings show the last delivery and its redacted error.
8. **Test send.** `POST …/slack/test` posts one message through the stored
   webhook synchronously and answers `502 slack_rejected` with Slack's error
   token when Slack refuses it.

## Consequences

- A team gets a channel feed with one URL, no Slack app to install or review.
- The channel sees no per-person mutes: it posts whatever its toggles allow.
  Mutes still apply to in-app and Telegram.
- In-app and Telegram now carry round failures and merges; people who did not
  want them mute the kinds.
- Changing `APP_ENCRYPTION_KEY` leaves stored webhook URLs unreadable; they
  are set again, as with the other sealed secrets.
- ADR-0108 §1 now covers per-person destinations only; a future channel-scoped
  destination (another chat webhook) follows this ADR's §5 instead.
- Rejected:
  - **A `slack` value in `notification_deliveries` (ADR-0108 §1 as written).**
    The row would hang on one recipient's notification: either one Slack
    message per recipient, or an arbitrary "first recipient" whose mute or
    absence decides whether the team's channel hears about the card. A
    notification with no recipients — a demo with `demoTelegram` off — would
    never reach Slack.
- Interactive actions in Slack (merge, feedback) would need a Slack app with a
  request URL and signing secret; that is a separate decision.
