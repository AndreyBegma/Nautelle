import type { NotificationKind } from '@nautelle/shared';
import { zonedDueAt } from '../ai-digest/ai-digest-time';
import type { DeliveryContent } from './telegram-delivery-ledger';

/** An email ready for `MailService.send`, without its recipient. */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** The parts of the daily digest (C-404): what waits on you, what was done. */
export type DigestSection = 'waiting' | 'done' | 'other';

const SECTION_OF: Record<NotificationKind, DigestSection> = {
  'person.needed': 'waiting',
  'slot.blocked': 'waiting',
  'pane.prompt': 'waiting',
  'quota.hit': 'other',
  'queue.dry': 'other',
  'pr.awaiting_approval': 'waiting',
  'runner.offline': 'other',
  'runner.online': 'other',
  'runner.connection_replaced': 'other',
  'budget.exceeded': 'other',
  'budget.threshold': 'other',
  'schedule.disabled': 'other',
  'action.requested': 'waiting',
  'card.finished': 'done',
  'card.waiting': 'waiting',
  'card.background_stalled': 'waiting',
  'card.paused': 'waiting',
  'card.demo': 'done',
  'cards.suggested': 'waiting',
  'steward.incident': 'waiting',
  'account.throttled': 'other',
  'telegram.link_pending': 'other',
};

export const digestSection = (kind: NotificationKind): DigestSection =>
  SECTION_OF[kind];

const SECTION_TITLES: Record<DigestSection, string> = {
  waiting: 'Waiting on you',
  done: 'Done',
  other: 'Other',
};

const SECTIONS: readonly DigestSection[] = ['waiting', 'done', 'other'];

const DAY_MS = 86_400_000;
const SUBJECT_MAX = 150;
const BODY_MAX = 2000;
const SETTINGS_PATH = '/account/notifications';

/**
 * The digest occurrence `now` belongs to: today's `time` in `timeZone` once it
 * has passed, else yesterday's. Items written up to it go out in that digest.
 */
export const digestOccurrence = (
  now: Date,
  time: string,
  timeZone: string,
): Date => {
  const today = zonedDueAt(now, time, timeZone);
  return today <= now
    ? today
    : zonedDueAt(new Date(now.getTime() - DAY_MS), time, timeZone);
};

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Subject and body are plain text; this makes them safe inside HTML. */
const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );

/** `APP_URL` + an app path; null without either, or for anything not a path. */
const appLink = (appUrl: string | null, path: string | null): string | null => {
  if (!appUrl || !path?.startsWith('/') || path.startsWith('//')) return null;
  return `${appUrl}${path}`;
};

/** "widget · i42-api · #42" — what the item is about. */
const where = (content: DeliveryContent): string =>
  [
    content.projectName,
    content.slot,
    content.issue !== null ? `#${content.issue}` : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');

const footer = (appUrl: string | null) => {
  const settings = appLink(appUrl, SETTINGS_PATH);
  const text = settings
    ? `Choose which emails you get: ${settings}`
    : 'Choose which emails you get in Account › Notifications.';
  const html = settings
    ? `Choose which emails you get in <a href="${escapeHtml(settings)}">Account › Notifications</a>.`
    : 'Choose which emails you get in Account › Notifications.';
  return { text, html };
};

const page = (body: string, appUrl: string | null): string =>
  [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2328">',
    body,
    `<p style="color:#59636e;font-size:12px">${footer(appUrl).html}</p>`,
    '</body></html>',
  ].join('');

/**
 * One notification as an email (C-404). Built only from the stored title, body
 * and names — never pane text, prompts or code — like the Telegram message.
 */
export const formatEmail = (
  content: DeliveryContent,
  appUrl: string | null,
): EmailContent => {
  const about = where(content);
  const link = appLink(appUrl, content.link);
  const body = clip(content.body, BODY_MAX);
  const count = content.count > 1 ? `Happened ${content.count} times.` : null;
  const text = [
    content.title,
    ...(body ? ['', body] : []),
    ...(about ? ['', about] : []),
    ...(count ? [count] : []),
    ...(link ? ['', `Open in Nautelle: ${link}`] : []),
    '',
    '—',
    footer(appUrl).text,
  ].join('\n');
  const html = page(
    [
      `<h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(content.title)}</h2>`,
      ...(body
        ? [`<p style="white-space:pre-wrap">${escapeHtml(body)}</p>`]
        : []),
      ...(about ? [`<p style="color:#59636e">${escapeHtml(about)}</p>`] : []),
      ...(count ? [`<p>${escapeHtml(count)}</p>`] : []),
      ...(link
        ? [`<p><a href="${escapeHtml(link)}">Open in Nautelle</a></p>`]
        : []),
    ].join(''),
    appUrl,
  );
  const subject = clip(
    about
      ? `${content.title} — ${content.projectName ?? about}`
      : content.title,
    SUBJECT_MAX,
  );
  return { subject: `[Nautelle] ${subject}`, text, html };
};

const itemLine = (item: DeliveryContent): string => {
  const about = where(item);
  const count = item.count > 1 ? ` (×${item.count})` : '';
  return `${item.title}${about ? ` — ${about}` : ''}${count}`;
};

/**
 * The daily digest (C-404): the person's digest items since the last one,
 * grouped into what waits on them, what was done, and the rest. `date`: the
 * day it is for, as the person reads it, e.g. `2026-10-25`.
 */
export const formatEmailDigest = (
  items: DeliveryContent[],
  appUrl: string | null,
  date: string,
): EmailContent => {
  const grouped = SECTIONS.map((section) => ({
    section,
    items: items.filter((item) => digestSection(item.kind) === section),
  })).filter((group) => group.items.length > 0);
  const waiting = grouped.find((g) => g.section === 'waiting')?.items.length;
  const summary = waiting
    ? `${waiting} waiting on you`
    : `${items.length} update${items.length === 1 ? '' : 's'}`;

  const text = [
    `Your Nautelle digest for ${date}`,
    ...grouped.flatMap((group) => [
      '',
      `${SECTION_TITLES[group.section]} (${group.items.length})`,
      ...group.items.map((item) => {
        const link = appLink(appUrl, item.link);
        return `• ${itemLine(item)}${link ? `\n  ${link}` : ''}`;
      }),
    ]),
    '',
    '—',
    footer(appUrl).text,
  ].join('\n');

  const html = page(
    [
      `<h2 style="font-size:18px;margin:0 0 8px">Your Nautelle digest for ${escapeHtml(date)}</h2>`,
      ...grouped.map((group) =>
        [
          `<h3 style="font-size:15px;margin:16px 0 4px">${escapeHtml(SECTION_TITLES[group.section])} (${group.items.length})</h3>`,
          '<ul style="padding-left:20px;margin:0">',
          ...group.items.map((item) => {
            const link = appLink(appUrl, item.link);
            const label = escapeHtml(itemLine(item));
            return `<li>${link ? `<a href="${escapeHtml(link)}">${label}</a>` : label}</li>`;
          }),
          '</ul>',
        ].join(''),
      ),
    ].join(''),
    appUrl,
  );
  return { subject: `[Nautelle] Daily digest: ${summary}`, text, html };
};

/** `at` as a calendar date in `timeZone`, `YYYY-MM-DD`; unknown zone → UTC. */
export const calendarDate = (at: Date, timeZone: string): string => {
  const read = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  try {
    return read(timeZone);
  } catch {
    return read('UTC');
  }
};
