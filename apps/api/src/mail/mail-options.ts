/** How the API reaches its SMTP server (C-404); tests point it at a fake one. */
export interface MailOptions {
  /** `SMTP_URL` — `smtp://` or `smtps://`, credentials inside; null: no email. */
  smtpUrl: string | null;
  /** `SMTP_FROM` — the sender of every email. */
  from: string;
  /** `APP_URL` — the web app, prefixed to links in emails; null: no links. */
  appUrl: string | null;
  /** Start the email delivery loop at bootstrap. Never under `APP_ENV=test`. */
  autoStart: boolean;
  /** How often the loop sends what is due and checks the digests. */
  intervalMs: number;
}

export const MAIL_OPTIONS = Symbol('MAIL_OPTIONS');

const SMTP_PROTOCOLS = new Set(['smtp:', 'smtps:']);

/** `SMTP_URL` as a URL, or null when it is unset or not an SMTP one. */
export const parseSmtpUrl = (raw: string | null): URL | null => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return SMTP_PROTOCOLS.has(url.protocol) && url.hostname ? url : null;
  } catch {
    return null;
  }
};

/**
 * The sender when `SMTP_FROM` is unset: the SMTP user when it is an address
 * (most providers only accept that one), else a local placeholder.
 */
const defaultFrom = (smtpUrl: string | null): string => {
  const user = decodeURIComponent(parseSmtpUrl(smtpUrl)?.username ?? '');
  return `Nautelle <${user.includes('@') ? user : 'nautelle@localhost'}>`;
};

export const mailOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): MailOptions => {
  const smtpUrl = env.SMTP_URL?.trim() || null;
  return {
    smtpUrl,
    from: env.SMTP_FROM?.trim() || defaultFrom(smtpUrl),
    appUrl: env.APP_URL?.trim().replace(/\/+$/, '') || null,
    autoStart: env.APP_ENV !== 'test',
    intervalMs: 10_000,
  };
};
