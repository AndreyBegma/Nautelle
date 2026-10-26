import { isSlackWebhookUrl } from '@nautelle/shared';
import { Inject, Injectable } from '@nestjs/common';
import { SLACK_OPTIONS, type SlackOptions } from './slack-options';

/** One post's outcome. `error` never carries the URL: it is a secret. */
export interface SlackPostResult {
  ok: boolean;
  /** The HTTP status; null when no response came. */
  status: number | null;
  /** Slack's error token (`no_service`, `channel_is_archived`…) or a short reason. */
  error: string | null;
  /** With a 429: how long Slack asked to wait, in ms. */
  retryAfterMs: number | null;
}

/** How much of Slack's answer is read: its error tokens are a few bytes. */
const BODY_MAX = 200;
/** Slack's error answers are one `snake_case` token. */
const TOKEN = /^[a-z][a-z0-9_]{0,63}$/;

const retryAfter = (raw: string | null): number | null => {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
};

/**
 * Posts to a Slack incoming webhook (C-405). Only a URL `isSlackWebhookUrl`
 * accepts, checked again at send time; redirects are not followed, so a post
 * never lands anywhere but Slack.
 */
@Injectable()
export class SlackClient {
  constructor(@Inject(SLACK_OPTIONS) private readonly options: SlackOptions) {}

  async post(url: string, text: string): Promise<SlackPostResult> {
    if (!isSlackWebhookUrl(url)) {
      return {
        ok: false,
        status: null,
        error: 'not_a_slack_webhook',
        retryAfterMs: null,
      };
    }
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ text, unfurl_links: false }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        ok: false,
        status: null,
        error: timeout ? 'timeout' : 'unreachable',
        retryAfterMs: null,
      };
    }
    const body = (await response.text().catch(() => '')).slice(0, BODY_MAX);
    const token = body.trim();
    if (response.status === 200) {
      return { ok: true, status: 200, error: null, retryAfterMs: null };
    }
    return {
      ok: false,
      status: response.status,
      error: TOKEN.test(token) ? token : `http_${response.status}`,
      retryAfterMs:
        response.status === 429
          ? retryAfter(response.headers.get('retry-after'))
          : null,
    };
  }
}
