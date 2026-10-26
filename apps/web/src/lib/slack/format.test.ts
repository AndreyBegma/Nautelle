import { describe, expect, test } from 'bun:test';
import type { SlackWebhookStatus } from '@nautelle/shared';
import { ApiError } from '../api';
import { slackStatus } from '../integrations/format';
import {
  describeSlackError,
  lastDeliveryFailed,
  lastDeliveryText,
  withEvent,
} from './format';

const status = (
  over: Partial<SlackWebhookStatus> = {},
): SlackWebhookStatus => ({
  scope: 'workspace',
  configured: true,
  urlHint: '…abcd',
  events: ['finished', 'demo'],
  encryptionAvailable: true,
  updatedAt: '2026-10-25T10:00:00.000Z',
  lastDelivery: null,
  ...over,
});

describe('Slack settings (C-405)', () => {
  test('withEvent keeps the catalogue order', () => {
    expect(withEvent(['merged', 'finished'], 'demo', true)).toEqual([
      'finished',
      'demo',
      'merged',
    ]);
    expect(withEvent(['finished', 'demo'], 'finished', false)).toEqual([
      'demo',
    ]);
  });

  test('the last delivery reads as one line', () => {
    expect(lastDeliveryText(status())).toBeNull();
    const at = '2026-10-25T10:00:00.000Z';
    expect(
      lastDeliveryText(
        status({ lastDelivery: { status: 'sent', at, error: null } }),
      ),
    ).toBe('Last message delivered');
    const failed = status({
      lastDelivery: { status: 'failed', at, error: 'channel_not_found' },
    });
    expect(lastDeliveryText(failed)).toBe(
      'Last message failed: channel_not_found',
    );
    expect(lastDeliveryFailed(failed)).toBe(true);
    expect(
      lastDeliveryFailed(
        status({ lastDelivery: { status: 'pending', at, error: null } }),
      ),
    ).toBe(false);
  });

  test("Slack's refusal is shown as the API wrote it", () => {
    expect(
      describeSlackError(
        new ApiError(
          502,
          'slack_rejected' as never,
          'Slack refused the message: no_service',
        ),
      ),
    ).toBe('Slack refused the message: no_service');
  });

  test('the overview card', () => {
    expect(slackStatus(status({ configured: false })).label).toBe('Not set up');
    expect(
      slackStatus(status({ configured: false, encryptionAvailable: false }))
        .detail,
    ).toContain('APP_ENCRYPTION_KEY');
    expect(slackStatus(status())).toMatchObject({
      tone: 'ok',
      label: 'Connected',
      detail: '2 events posted for every project without its own webhook.',
    });
    expect(
      slackStatus(
        status({
          lastDelivery: {
            status: 'failed',
            at: '2026-10-25T10:00:00.000Z',
            error: 'no_service',
          },
        }),
      ).tone,
    ).toBe('warn');
  });
});
