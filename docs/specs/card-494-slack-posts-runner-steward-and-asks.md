# C-494: Slack also posts a runner going offline, a steward incident and a session's ask (ADR-0123)

Stack **S-20**, stage 2: after C-473 and C-489, which also add ADRs to `docs/adr/README.md`.

## Summary
A team that follows Nautelle in Slack hears about cards, demos and budgets, but not about three things that stop work:
- a runner going offline, after which nothing runs;
- an escalated steward incident;
- a session asking a person to approve something (away mode, ADR-0105).

ADR-0109 §3 limited Slack to six card and budget events. This card adds three toggles and records the change as ADR-0123, which amends ADR-0109 §3.

## Scope
**In:**
- `SLACK_EVENTS` and `slackEventFor`;
- the outbox, including the workspace webhook for project-less kinds;
- the two Slack settings screens;
- ADR-0123.

**Out:** interactive buttons (ADR-0109: an incoming webhook cannot receive them), and `runner.online`.

## Current behaviour
- [Confirmed] `packages/shared/src/notifications/slack.ts:9-16`: `SLACK_EVENTS = finished, demo, question, failed, budget, merged`. `slackEventFor` maps kinds to these events and returns null for every other kind.
- [Confirmed] `apps/api/src/slack/slack-outbox.ts:67-76`: `enqueueSlack` returns early when `!input.projectId`. `runner.offline` is scope `admin` with `projectId: null` (`apps/api/src/notifications/runner-watcher.ts:123-126`), so it can never post.
- [Confirmed] `SlackDelivery.projectId String` is required (`apps/api/prisma/schema.prisma:2360-2378`). `SlackWebhook.events String[]` (`:2336-2337`).
- [Confirmed] `steward.incident` and `action.requested` are project-scoped kinds (`packages/shared/src/notifications/kinds.ts:199-205,264-270`).
- [Confirmed] UI: `apps/web/src/app/(app)/projects/[projectId]/settings/slack-tab.tsx` and `apps/web/src/app/admin/integrations/slack/page.tsx` render the toggles from `SLACK_EVENT_LABELS`.

## Data / Schema
Migration `apps/api/prisma/migrations/20261231000050_slack_delivery_workspace`: `SlackDelivery.projectId` becomes nullable. The relation becomes optional and keeps `onDelete: Cascade`.

## Decisions
- **ADR-0123**, `docs/adr/0123-slack-also-posts-runner-offline-steward-incidents-and-session-asks.md`. It amends ADR-0109 §3 with three events:
  - `runner` ← `runner.offline`, which goes to the **workspace** webhook only, because a runner belongs to no project;
  - `incident` ← `steward.incident`;
  - `ask` ← `action.requested`.
- Existing webhooks keep their stored `events`, so the new toggles are **off** for them; a new webhook gets all nine on. A person who set up Slack for cards is not surprised by new traffic.
- An `ask` message names the project and the request title (`actionRequestTitle`), and links to the Inbox (C-469 changes the link). It never includes the tool input, which can quote a secret. ADR-0109 already keeps the round's error text out of Slack; this follows the same rule.
- An `incident` message carries the incident's title only, and no log lines.

## Acceptance criteria
- [ ] `slack.spec` (shared): `slackEventFor` maps the three kinds, and `runner.online` maps to null.
- [ ] `slack.e2e.spec.ts`: `runner.offline` queues one delivery on the workspace webhook, with a null `projectId`, and none on project webhooks. `steward.incident` and `action.requested` queue on the covering webhook only when its toggle is on.
- [ ] `slack.e2e.spec.ts`: an `ask` message contains no tool input. A fixture with a secret-looking argument is checked.
- [ ] An existing webhook's events are unchanged after the migration.
- [ ] ADR-0123 is listed in `docs/adr/README.md`, and ADR-0109's row notes "§3 amended by 0123".
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-slack-runner-incident-ask-events.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Admin › Integrations › Slack and shows the three new toggles with their hints.

## Risks
- A flapping runner posts often to the workspace channel. `runner.offline` is written once per incident (`runner-watcher.ts:116`), which bounds it.

## Open questions
- None.
