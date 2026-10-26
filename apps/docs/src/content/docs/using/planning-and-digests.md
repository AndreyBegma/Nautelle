---
title: Adding work, the Planner and digests
description: How work enters Nautelle, how the Planner turns a brief into cards, and the two daily digests.
sidebar:
  order: 5
---

Work in Nautelle is a card on the [Board](../../concepts/board/). This page
covers how a card is made, how the Planner helps you write it, and the two
daily digests that sum up what happened.

## Adding work

Every **New work** or **New card** button, wherever it sits, makes a card. The
Fleet header, the Queue header, the project page and the round `+` beside the
navigation capsule all open the Board's **New work** dialog. The web app has no
dialog that creates a GitHub issue.

There are three ways in:

- **Quick card.** One text field and attachments become a card in To Do in one
  step. A cheap model suggests the title and the kind (Feature or Bug) while you
  type, and both stay editable. Enter saves, Shift+Enter is a new line, and
  **Run now** also starts the card. Open it with **New card** in the command
  palette (⌘K).
- **New work.** An interview with the Planner, for work that is not obvious
  yet. See [The Planner](#the-planner).
- **From an incoming issue.** The Queue page has an **Incoming** list of the
  project's open GitHub issues. The **Labelled** view shows the issues that
  carry the orchestrator's ready label, **All open** shows every open issue.
  **Make a card** creates a To Do card titled after the issue, with its body
  taken from the issue and linked to it, so the card's pull request closes the
  issue. Once a card works an issue, the row shows **Open card** instead. Making
  a card leaves the issue's label alone.

Issues are created on GitHub, or by a session that hands work to the fleet; they
reach Nautelle through the Incoming list.

## The Planner

**New work** starts a Planner session. You write what you want, in any
language, and attach files if they help. The Planner then:

1. **Asks questions** in your language, in up to four rounds. Choose
   **Enough — generate** at any point to stop early.
2. **Writes the card in English**: a title and a body that is a short
   specification.
3. **Proposes a split** when your request is several independent tasks, or one
   task too big for a single agent. It offers 2 to 8 cards. **Keep one card**
   declines the split, or **Split** lets you edit titles and kinds, remove
   entries and **Create N cards** in one step.

Split cards land in To Do with no dependencies between them. Work that must
happen in order should be one card. You can still add dependencies by hand on a
card's sheet.

Plans made before this flow stay readable: their tasks appear in Work with the
source Plan.

### Designs

When a card needs a user interface, the Planner draws an HTML mockup of it
before the card runs, using the project's UI profile. The design waits in your
[Inbox](../inbox-and-away-mode/) until you approve it or send it
back with a comment. A card that needs a design cannot run until it is approved.

### Settings

Under **Settings → Planning**:

- **Planner** — how a feature's specification is published when a plan is sent
  to the fleet, and this project's own instructions for the Planner, which
  replace the global ones. Instructions are written in English.
- **Design** — what new designs start from: the UI summary, style kit and
  snippets, approved screens and style rules, default design skills and design
  templates.

The model the Planner uses is a per-person setting, **Planning model**, on your
account page.

## Digests

Nautelle sends two separate daily digests. Either can be on without the other.

| | Steward digest | AI digest |
|---|---|---|
| What it covers | Stuck work Steward found, and what it did about it. | The last day: what got done, what is stuck, what waits for a person. |
| Written by | A template and a model on a runner, when one is awake. | The project's default AI model, through the API. No runner needed. |
| Goes to | Telegram and Activity. | Telegram and Activity. |
| Turn it on in | **Settings → Automation → Steward** | **Settings → Planning → AI digest** |
| Needs | Steward switched on. | Nothing else; it is off until you turn it on. |

### Steward digest

Steward watches Board cards and runner runs for stuck work. On the **Steward**
settings, the switch **Steward** turns it on, and **Digest time** sets when the
digest arrives each day in your time zone. It is also sent when Away mode is
switched off. Off means no incidents, no automatic actions and no digest. The
latest one is in **Activity**.

### AI digest

On **AI digest**, turn on **Daily AI digest**, then set the **Time** and the
**Timezone**. It is off until you do. A change applies from the next day the time
comes round, so switching it on in the afternoon does not send one at once.

The digest is made of exact lists of finished work, stuck work and work that
waits for a person, each line linking to its pull request or card. The model
writes only a short overview. Each digest is one call on the default model and
counts toward its provider's monthly cap. When the cap is reached, that day is
skipped.

Only project administrators change either digest; everyone else can read the
settings.

## Sources

- [ADR-0098](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0098-one-work-model-cards-everywhere-fleet-shows-who-works-queue-shows-incoming-issues.md):
  one work model, New work and Incoming issues.
- [ADR-0034](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0034-the-planner-lives-on-the-board-and-makes-cards.md)
  and [ADR-0037](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0037-new-work-is-one-intake-that-can-split.md):
  the Planner and the split.
- [ADR-0040](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0040-steward.md):
  Steward and its digest.
- [ADR-0066](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0066-the-daily-ai-digest-and-summaries-are-gateway-calls-cached-by-source.md):
  the AI digest.
