import type { HttpException } from '@nestjs/common';
import { notificationError } from '../notifications';

/** A webhook URL is sealed with `APP_ENCRYPTION_KEY`, never stored without it. */
export const slackEncryptionMissing = (): HttpException =>
  notificationError(
    409,
    'encryption_key_missing',
    'APP_ENCRYPTION_KEY is not configured (32 random bytes, base64); a Slack webhook URL cannot be stored without it',
  );

/** The first save of a webhook needs its URL. */
export const slackUrlRequired = (): HttpException =>
  notificationError(
    400,
    'slack_url_required',
    'Enter the Slack incoming webhook URL',
  );

export const slackUrlInvalid = (): HttpException =>
  notificationError(
    400,
    'slack_url_invalid',
    'Not a Slack incoming webhook URL: it starts with https://hooks.slack.com/',
  );

/** A test send, or a webhook action, with no webhook saved. */
export const slackNotConfigured = (): HttpException =>
  notificationError(404, 'slack_not_configured', 'No Slack webhook is set');

/** Slack answered the test message with an error. */
export const slackRejected = (reason: string): HttpException =>
  notificationError(502, 'slack_rejected', `Slack refused the message: ${reason}`);

/** The stored URL cannot be opened: the encryption key changed or is gone. */
export const slackUnavailable = (): HttpException =>
  notificationError(
    409,
    'slack_unavailable',
    'The stored webhook URL cannot be read with the current APP_ENCRYPTION_KEY; enter it again',
  );
