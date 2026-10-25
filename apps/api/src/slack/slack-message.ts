import type { SlackEvent } from '@nautelle/shared';

/**
 * What one Slack message says (C-405), as stored on its delivery. Links into
 * the app are paths: `slackText` makes them absolute with the app URL when
 * the message is sent, so a changed `APP_URL` applies to queued messages too.
 */
export interface SlackMessageParts {
  event: SlackEvent;
  /** The notification's title, e.g. `C-12 "Login" is finished`. */
  title: string;
  body: string;
  /** The project's name, said under the message. */
  project: string;
  /** A path into the app (`/projects/:id/board?card=12`), or null. */
  link: string | null;
  /** The card's pull request on GitHub, when it has one. */
  prUrl: string | null;
  prNumber: number | null;
  /** A demo is ready: the message links to it on the card. */
  demo: boolean;
}

/** Slack's mrkdwn control characters (api.slack.com, "Escaping text"). */
export const slackEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A URL Slack may link: `http(s)`, and nothing that ends a `<…|…>` link. */
const linkable = (url: string): boolean => {
  if (/[\s<>|]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const link = (url: string, label: string): string =>
  `<${url}|${slackEscape(label)}>`;

/**
 * The message's text in Slack mrkdwn: the title (linked to the card when the
 * app URL is known), the body, then the pull request, the demo and the
 * project. No buttons: an incoming webhook cannot receive their presses.
 */
export const slackText = (
  parts: SlackMessageParts,
  appUrl: string | null,
): string => {
  const app = appUrl && parts.link ? `${appUrl}${parts.link}` : null;
  const target = app && linkable(app) ? app : null;
  const title = target ? link(target, parts.title) : slackEscape(parts.title);
  const lines = [`*${title}*`];
  if (parts.body) lines.push(slackEscape(parts.body));
  const footer: string[] = [];
  if (parts.prUrl && linkable(parts.prUrl)) {
    footer.push(
      link(
        parts.prUrl,
        parts.prNumber ? `Pull request #${parts.prNumber}` : 'Pull request',
      ),
    );
  }
  if (parts.demo && target) footer.push(link(target, 'Watch the demo'));
  footer.push(slackEscape(parts.project));
  lines.push(footer.join('  ·  '));
  return lines.join('\n');
};

/** The test message an admin sends from the settings. */
export const slackTestText = (
  scope: 'project' | 'workspace',
  project: string | null,
  appUrl: string | null,
): string => {
  const where =
    scope === 'project' && project
      ? `for ${slackEscape(project)}`
      : 'for every project without its own webhook';
  const open = appUrl && linkable(appUrl) ? ` ${link(appUrl, 'Open Nautelle')}` : '';
  return `*Nautelle test message*\nThis channel receives Nautelle notifications ${where}.${open}`;
};
