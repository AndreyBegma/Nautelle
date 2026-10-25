import {
  SLACK_EVENTS,
  type SlackEvent,
  type SlackWebhookStatus,
} from '@nautelle/shared';
import { ApiError, type Described, describeError } from '../api';
import { ENCRYPTION_KEY_REMEDY } from '../prerequisites/copy';

/** Where the workspace-wide webhook is set. */
export const SLACK_ADMIN_PAGE = '/admin/integrations/slack';

/** A sentence for the Slack routes' own error codes (C-405). */
export function describeSlackError(error: unknown): Described {
  if (error instanceof ApiError) {
    switch (String(error.code)) {
      case 'encryption_key_missing':
        return `The server has no APP_ENCRYPTION_KEY, so it cannot store a webhook URL. ${ENCRYPTION_KEY_REMEDY}`;
      case 'slack_url_required':
        return 'Paste the webhook URL Slack gave you.';
      case 'slack_url_invalid':
        return 'That is not a Slack incoming webhook URL. It starts with https://hooks.slack.com/.';
      case 'slack_not_configured':
        return 'No webhook is set here yet.';
      case 'slack_rejected':
        return error.message;
      case 'slack_unavailable':
        return `The stored URL cannot be opened: APP_ENCRYPTION_KEY is missing or changed. Paste the URL again. ${ENCRYPTION_KEY_REMEDY}`;
    }
  }
  return describeError(error);
}

/** The events in catalogue order, `event` turned on or off. */
export function withEvent(
  events: readonly SlackEvent[],
  event: SlackEvent,
  on: boolean,
): SlackEvent[] {
  return SLACK_EVENTS.filter((e) => (e === event ? on : events.includes(e)));
}

/** The last delivery in one line, or null when nothing was sent yet. */
export function lastDeliveryText(status: SlackWebhookStatus): string | null {
  const last = status.lastDelivery;
  if (!last) return null;
  if (last.status === 'sent') return 'Last message delivered';
  if (last.status === 'pending') {
    return last.error
      ? `Last message is being retried: ${last.error}`
      : 'Last message is waiting to be sent';
  }
  return `Last message failed: ${last.error ?? 'Slack did not accept it'}`;
}

/** The tone of the last delivery's line. */
export function lastDeliveryFailed(status: SlackWebhookStatus): boolean {
  return (
    status.lastDelivery !== null &&
    status.lastDelivery.status !== 'sent' &&
    status.lastDelivery.error !== null
  );
}
