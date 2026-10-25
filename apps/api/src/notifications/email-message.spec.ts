import {
  calendarDate,
  digestOccurrence,
  digestSection,
  formatEmail,
  formatEmailDigest,
} from './email-message';
import type { DeliveryContent } from './telegram-delivery-ledger';

const APP_URL = 'https://nautelle.example.com';

const content = (over: Partial<DeliveryContent> = {}): DeliveryContent => ({
  kind: 'card.waiting',
  title: 'C-7 "Add login" is waiting for you',
  body: 'Its worker asks you a question in its session.',
  projectName: 'widget',
  slot: null,
  issue: null,
  link: '/projects/p1/board?card=7',
  count: 1,
  ...over,
});

describe('digestOccurrence (C-404)', () => {
  it("is today's time once it has passed, else yesterday's", () => {
    expect(
      digestOccurrence(new Date('2026-10-25T10:00:00Z'), '09:00', 'UTC'),
    ).toEqual(new Date('2026-10-25T09:00:00Z'));
    expect(
      digestOccurrence(new Date('2026-10-25T08:59:00Z'), '09:00', 'UTC'),
    ).toEqual(new Date('2026-10-24T09:00:00Z'));
  });

  it("follows the person's zone", () => {
    // 09:00 in Kyiv is 06:00 UTC in summer time (until 25 October 2026).
    expect(
      digestOccurrence(
        new Date('2026-10-20T07:00:00Z'),
        '09:00',
        'Europe/Kyiv',
      ),
    ).toEqual(new Date('2026-10-20T06:00:00Z'));
  });
});

describe('calendarDate', () => {
  it('reads the date in the zone, UTC for an unknown one', () => {
    const at = new Date('2026-10-25T22:30:00Z');
    expect(calendarDate(at, 'UTC')).toBe('2026-10-25');
    expect(calendarDate(at, 'Europe/Kyiv')).toBe('2026-10-26');
    expect(calendarDate(at, 'Mars/Olympus')).toBe('2026-10-25');
  });
});

describe('formatEmail', () => {
  it('names the item and the project, links the app and the settings', () => {
    const email = formatEmail(content(), APP_URL);
    expect(email.subject).toBe(
      '[Nautelle] C-7 "Add login" is waiting for you — widget',
    );
    expect(email.text).toContain(
      `Open in Nautelle: ${APP_URL}/projects/p1/board?card=7`,
    );
    expect(email.text).toContain(`${APP_URL}/account/notifications`);
  });

  it('escapes the stored text in HTML', () => {
    const email = formatEmail(
      content({ title: '<script>alert(1)</script>', body: 'a & "b"' }),
      APP_URL,
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('a &amp; &quot;b&quot;');
  });

  it('carries no links without APP_URL, nor for a link that is not a path', () => {
    expect(formatEmail(content(), null).text).not.toContain('http');
    expect(
      formatEmail(content({ link: '//evil.example.com' }), APP_URL).text,
    ).not.toContain('Open in Nautelle');
  });
});

describe('formatEmailDigest', () => {
  it('groups what waits on you before what was done', () => {
    const email = formatEmailDigest(
      [
        content({ kind: 'card.finished', title: 'C-1 "A" is finished' }),
        content(),
        content({ kind: 'quota.hit', title: 'Quota hit', count: 3 }),
      ],
      APP_URL,
      '2026-10-25',
    );
    expect(email.subject).toBe('[Nautelle] Daily digest: 1 waiting on you');
    const order = ['Waiting on you (1)', 'Done (1)', 'Other (1)'].map((h) =>
      email.text.indexOf(h),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(email.text).toContain('Quota hit — widget (×3)');
  });

  it('counts updates when nothing waits', () => {
    expect(
      formatEmailDigest(
        [content({ kind: 'card.finished' }), content({ kind: 'card.demo' })],
        APP_URL,
        '2026-10-25',
      ).subject,
    ).toBe('[Nautelle] Daily digest: 2 updates');
  });

  it('puts questions in "waiting" and finished cards in "done"', () => {
    expect(digestSection('card.waiting')).toBe('waiting');
    expect(digestSection('pr.awaiting_approval')).toBe('waiting');
    expect(digestSection('card.finished')).toBe('done');
    expect(digestSection('runner.offline')).toBe('other');
  });
});
