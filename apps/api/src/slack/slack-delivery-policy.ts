import type { SlackPostResult } from './slack-client';

/** Attempts before a message is given up on. */
export const SLACK_MAX_ATTEMPTS = 5;
/** The first retry's wait; each next one doubles it. */
const BACKOFF_BASE_MS = 30_000;
/** The longest wait, whatever Slack's `Retry-After` says. */
const BACKOFF_MAX_MS = 3_600_000;

/**
 * Answers that a retry cannot fix: a bad payload (400), a revoked or
 * disabled webhook (403, 404), an archived channel (410).
 */
const PERMANENT = new Set([400, 401, 403, 404, 410]);

export interface SlackNextState {
  status: 'sent' | 'pending' | 'failed';
  nextAttemptAt: Date;
}

/**
 * What a delivery becomes after its `attempts`-th attempt (C-405): sent;
 * failed at once on an answer a retry cannot fix, or after the last attempt;
 * else pending again, after `Retry-After` on a 429 and an exponential backoff
 * otherwise.
 */
export const slackAfterAttempt = (
  result: SlackPostResult,
  attempts: number,
  now: Date,
): SlackNextState => {
  if (result.ok) return { status: 'sent', nextAttemptAt: now };
  if (
    (result.status !== null && PERMANENT.has(result.status)) ||
    result.error === 'not_a_slack_webhook' ||
    attempts >= SLACK_MAX_ATTEMPTS
  ) {
    return { status: 'failed', nextAttemptAt: now };
  }
  const backoff = BACKOFF_BASE_MS * 2 ** (attempts - 1);
  const wait = Math.min(result.retryAfterMs ?? backoff, BACKOFF_MAX_MS);
  return { status: 'pending', nextAttemptAt: new Date(now.getTime() + wait) };
};
