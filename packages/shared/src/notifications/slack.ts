import type { NotificationKind } from './kinds';

/**
 * C-405 (ADR-0109): what a Slack incoming webhook can post. Each is a toggle
 * on the webhook; a notification kind maps to at most one of them
 * (`slackEventFor`). `demo` is the ready video, posted after `finished`; a
 * demo that failed is a `failed`.
 */
export const SLACK_EVENTS = [
  'finished',
  'demo',
  'question',
  'failed',
  'budget',
  'merged',
] as const;
export type SlackEvent = (typeof SLACK_EVENTS)[number];

export const SLACK_EVENT_LABELS: Record<SlackEvent, string> = {
  finished: 'Card finished',
  demo: 'Demo video ready',
  question: 'Card waits for you',
  failed: 'Card or demo failed',
  budget: 'Budget reached',
  merged: 'Pull request merged',
};

export const SLACK_EVENT_HINTS: Record<SlackEvent, string> = {
  finished: 'A card round finished; with its pull request.',
  demo: 'A card’s demo video is ready; with its pull request and the demo.',
  question: 'A card round stopped, asks a question or shows a dialog.',
  failed: 'A card round failed to run, or its demo video failed.',
  budget: 'A project budget reached a threshold or its limit, or paused a card.',
  merged: 'A card’s pull request merged.',
};

export const isSlackEvent = (value: string): value is SlackEvent =>
  (SLACK_EVENTS as readonly string[]).includes(value);

/**
 * The Slack event a notification kind posts as, or null for a kind Slack
 * never posts. `demoStatus` is the `card.demo` event's status: a ready demo
 * is `demo`, a failed one `failed`.
 */
export const slackEventFor = (
  kind: NotificationKind,
  demoStatus?: string,
): SlackEvent | null => {
  switch (kind) {
    case 'card.finished':
      return 'finished';
    case 'card.demo':
      return demoStatus === 'ready'
        ? 'demo'
        : demoStatus === 'failed'
          ? 'failed'
          : null;
    case 'card.waiting':
      return 'question';
    case 'card.failed':
      return 'failed';
    case 'budget.threshold':
    case 'budget.exceeded':
    case 'card.paused':
      return 'budget';
    case 'card.merged':
      return 'merged';
    default:
      return null;
  }
};

/** Hosts Slack issues incoming webhook URLs from (commercial and GovSlack). */
const SLACK_HOOK_HOSTS = ['hooks.slack.com', 'hooks.slack-gov.com'];
const SLACK_HOOK_PATH = /^\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;
export const SLACK_WEBHOOK_URL_MAX = 512;

/**
 * Whether `value` is a Slack incoming webhook URL: `https`, a Slack hooks
 * host, no port, credentials, query or fragment. Anything else is refused,
 * so the URL field cannot point the API at another host.
 */
export const isSlackWebhookUrl = (value: string): boolean => {
  if (value.length > SLACK_WEBHOOK_URL_MAX) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    SLACK_HOOK_HOSTS.includes(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    SLACK_HOOK_PATH.test(url.pathname)
  );
};

export const SLACK_DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const;
export type SlackDeliveryStatus = (typeof SLACK_DELIVERY_STATUSES)[number];

/** Where a webhook posts: one project, or every project without its own. */
export type SlackWebhookScope = 'project' | 'workspace';

export interface SlackLastDelivery {
  status: SlackDeliveryStatus;
  /** The last attempt, or when it was queued while none was made. */
  at: string;
  /** Why the last attempt failed, redacted; null after a good one. */
  error: string | null;
}

/**
 * `GET|PUT /projects/:projectId/slack` and `GET|PUT /admin/integrations/slack`.
 * The URL is a secret and is never returned — only its last characters.
 */
export interface SlackWebhookStatus {
  scope: SlackWebhookScope;
  configured: boolean;
  /** `…/abcd`: the URL's last four characters; null when not configured. */
  urlHint: string | null;
  /** The events posted; every event when not configured yet. */
  events: SlackEvent[];
  /** `APP_ENCRYPTION_KEY` is set and usable; without it no URL is stored. */
  encryptionAvailable: boolean;
  updatedAt: string | null;
  lastDelivery: SlackLastDelivery | null;
  /**
   * Project only: the project has no webhook of its own and the workspace one
   * posts for it.
   */
  workspaceFallback?: boolean;
}

/**
 * `PUT` — `url` is required when none is stored yet; without it the stored
 * URL is kept and only the events change.
 */
export interface SlackWebhookUpdate {
  url?: string;
  events: SlackEvent[];
}
