import { describe, expect, it } from 'bun:test';
import { isSlackWebhookUrl, slackEventFor } from './slack';

describe('isSlackWebhookUrl (C-405)', () => {
  it('accepts Slack incoming webhook URLs', () => {
    for (const url of [
      'https://hooks.slack.com/services/T000/B000/XXXXXXXX',
      'https://hooks.slack.com/workflows/T000/A000/123/abc',
      'https://hooks.slack.com/triggers/T000/123/abc',
      'https://hooks.slack-gov.com/services/T000/B000/XXXXXXXX',
    ]) {
      expect(isSlackWebhookUrl(url)).toBe(true);
    }
  });

  it('refuses anything that could post elsewhere', () => {
    for (const url of [
      'http://hooks.slack.com/services/T000/B000/XXXX',
      'https://hooks.slack.com.evil.test/services/T000/B000/XXXX',
      'https://evil.test/services/T000/B000/XXXX',
      'https://hooks.slack.com:8443/services/T000/B000/XXXX',
      'https://user:pass@hooks.slack.com/services/T000/B000/XXXX',
      'https://hooks.slack.com/services/T000/B000/XXXX?x=1',
      'https://hooks.slack.com/services/T000/B000/XXXX#x',
      'https://hooks.slack.com/api/chat.postMessage',
      'https://hooks.slack.com/services/../../x',
      `https://hooks.slack.com/services/${'a'.repeat(600)}`,
      'not a url',
      '',
    ]) {
      expect(isSlackWebhookUrl(url)).toBe(false);
    }
  });
});

describe('slackEventFor (C-405)', () => {
  it('maps the kinds Slack posts', () => {
    expect(slackEventFor('card.finished')).toBe('finished');
    expect(slackEventFor('card.demo', 'ready')).toBe('demo');
    expect(slackEventFor('card.demo', 'failed')).toBe('failed');
    expect(slackEventFor('card.waiting')).toBe('question');
    expect(slackEventFor('card.failed')).toBe('failed');
    expect(slackEventFor('budget.threshold')).toBe('budget');
    expect(slackEventFor('budget.exceeded')).toBe('budget');
    expect(slackEventFor('card.paused')).toBe('budget');
    expect(slackEventFor('card.merged')).toBe('merged');
  });

  it('posts nothing else', () => {
    expect(slackEventFor('card.demo')).toBeNull();
    expect(slackEventFor('pane.prompt')).toBeNull();
    expect(slackEventFor('runner.offline')).toBeNull();
  });
});
