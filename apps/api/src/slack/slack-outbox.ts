import {
  type NotificationKind,
  type SlackEvent,
  slackEventFor,
} from '@nautelle/shared';
import type { Prisma, SlackWebhook } from '@prisma/client';
import type { SlackMessageParts } from './slack-message';

type Tx = Prisma.TransactionClient;

/** What the outbox needs of a notification (`NotificationInput`). */
export interface SlackOutboxInput {
  kind: NotificationKind;
  projectId: string | null;
  title: string;
  body: string;
  link: string | null;
  eventId: bigint | null;
}

/**
 * ADR-0109 §2: the webhook that posts for a project — its own, else the
 * workspace one. A project's webhook replaces the workspace one entirely,
 * events included.
 */
export const slackWebhookFor = async (
  tx: Tx,
  projectId: string,
): Promise<SlackWebhook | null> =>
  (await tx.slackWebhook.findUnique({ where: { projectId } })) ??
  (await tx.slackWebhook.findFirst({ where: { projectId: null } }));

/** Whether the webhook that posts for `projectId` posts any of `events`. */
export const slackPosts = async (
  tx: Tx,
  projectId: string,
  events: readonly SlackEvent[],
): Promise<boolean> => {
  const webhook = await slackWebhookFor(tx, projectId);
  return webhook !== null && events.some((e) => webhook.events.includes(e));
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;

/** The kinds whose message names the card's pull request. */
const WITH_PR: ReadonlySet<NotificationKind> = new Set([
  'card.finished',
  'card.merged',
  'card.demo',
]);

/**
 * C-405: queues the Slack message of one notification, inside the writer's
 * transaction — once per notification, not per recipient, and whatever any
 * person's rules or mutes say: the channel is the project's. A notification
 * without a project (a user budget, a runner) is never posted. `(webhook,
 * event, kind)` is unique, so a replayed event posts once.
 */
export const enqueueSlack = async (
  tx: Tx,
  input: SlackOutboxInput,
): Promise<void> => {
  if (!input.projectId) return;
  // Most kinds never post: skip the queries for them.
  if (
    input.kind !== 'card.demo' &&
    slackEventFor(input.kind) === null
  ) {
    return;
  }
  const webhook = await slackWebhookFor(tx, input.projectId);
  if (!webhook) return;
  const event =
    input.eventId !== null && WITH_PR.has(input.kind)
      ? await tx.event.findUnique({
          where: { id: input.eventId },
          select: { data: true },
        })
      : null;
  const data = asRecord(event?.data);
  const slackEvent = slackEventFor(
    input.kind,
    typeof data.status === 'string' ? data.status : undefined,
  );
  if (!slackEvent || !webhook.events.includes(slackEvent)) return;

  let prUrl = typeof data.prUrl === 'string' ? data.prUrl : null;
  let prNumber = positiveInt(data.prNumber);
  if (input.kind === 'card.demo' && typeof data.cardId === 'string') {
    const card = await tx.boardCard.findUnique({
      where: { id: data.cardId },
      select: { prUrl: true, prNumber: true },
    });
    prUrl = card?.prUrl ?? null;
    prNumber = card?.prNumber ?? null;
  }
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { displayName: true },
  });
  if (!project) return;
  const message: SlackMessageParts = {
    event: slackEvent,
    title: input.title,
    body: input.body,
    project: project.displayName,
    link: input.link,
    prUrl,
    prNumber,
    demo: slackEvent === 'demo',
  };
  await tx.slackDelivery.createMany({
    data: [
      {
        webhookId: webhook.id,
        projectId: input.projectId,
        kind: input.kind,
        eventId: input.eventId,
        message: { ...message },
      },
    ],
    skipDuplicates: true,
  });
};
