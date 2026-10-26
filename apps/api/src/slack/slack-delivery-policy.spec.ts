import type { SlackPostResult } from './slack-client';
import { SLACK_MAX_ATTEMPTS, slackAfterAttempt } from './slack-delivery-policy';

const now = new Date('2026-10-25T10:00:00Z');
const answer = (overrides: Partial<SlackPostResult>): SlackPostResult => ({
  ok: false,
  status: 500,
  error: 'http_500',
  retryAfterMs: null,
  ...overrides,
});
const inMs = (ms: number) => new Date(now.getTime() + ms);

describe('slackAfterAttempt (C-405)', () => {
  it('is sent on a good answer', () => {
    expect(
      slackAfterAttempt(answer({ ok: true, status: 200, error: null }), 1, now),
    ).toEqual({ status: 'sent', nextAttemptAt: now });
  });

  it('gives up at once on an answer a retry cannot fix', () => {
    for (const status of [400, 403, 404, 410]) {
      expect(slackAfterAttempt(answer({ status }), 1, now).status).toBe(
        'failed',
      );
    }
    expect(
      slackAfterAttempt(
        answer({ status: null, error: 'not_a_slack_webhook' }),
        1,
        now,
      ).status,
    ).toBe('failed');
  });

  it('backs off on a server error or no answer, then gives up', () => {
    expect(slackAfterAttempt(answer({}), 1, now)).toEqual({
      status: 'pending',
      nextAttemptAt: inMs(30_000),
    });
    expect(
      slackAfterAttempt(answer({ status: null, error: 'timeout' }), 3, now),
    ).toEqual({ status: 'pending', nextAttemptAt: inMs(120_000) });
    expect(slackAfterAttempt(answer({}), SLACK_MAX_ATTEMPTS, now).status).toBe(
      'failed',
    );
  });

  it('waits what a 429 asks, at most an hour', () => {
    expect(
      slackAfterAttempt(answer({ status: 429, retryAfterMs: 5_000 }), 1, now),
    ).toEqual({ status: 'pending', nextAttemptAt: inMs(5_000) });
    expect(
      slackAfterAttempt(
        answer({ status: 429, retryAfterMs: 86_400_000 }),
        1,
        now,
      ).nextAttemptAt,
    ).toEqual(inMs(3_600_000));
  });
});
