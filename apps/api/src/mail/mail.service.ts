import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { MAIL_OPTIONS, type MailOptions, parseSmtpUrl } from './mail-options';

/** One email. `text` is always sent; `html` is the optional rich version. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Where the SMTP server is — never its credentials. */
export interface MailServer {
  /** `host:port`. */
  server: string;
  secure: boolean;
  from: string;
}

/** A send that did not go through; `message` never carries credentials. */
export class MailSendError extends Error {
  constructor(
    message: string,
    /** The server refused it for good (5xx): retrying will not help. */
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'MailSendError';
  }
}

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;
const ERROR_MAX = 300;

/**
 * The API's one way to send email (C-404, ADR-0108): notifications, the admin
 * test send, and the self-service password reset (C-402) all go through it.
 * Without `SMTP_URL` it is not `configured` and nothing is ever sent.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly url: URL | null;
  private transport: Transporter | null = null;

  constructor(@Inject(MAIL_OPTIONS) private readonly options: MailOptions) {
    this.url = parseSmtpUrl(options.smtpUrl);
    if (options.smtpUrl && !this.url) {
      this.logger.warn(
        'SMTP_URL is not an smtp:// or smtps:// URL; email is off',
      );
    }
  }

  get configured(): boolean {
    return this.url !== null;
  }

  /** `APP_URL` without a trailing slash; null: emails carry no links. */
  get appUrl(): string | null {
    return this.options.appUrl;
  }

  server(): MailServer | null {
    if (!this.url) return null;
    const secure = this.url.protocol === 'smtps:';
    return {
      server: `${this.url.hostname}:${this.url.port || (secure ? '465' : '587')}`,
      secure,
      from: this.options.from,
    };
  }

  /** The sender every email carries, `SMTP_FROM` or its default. */
  get from(): string {
    return this.options.from;
  }

  /** Throws `MailSendError` when it is not configured or the server refused. */
  async send(message: MailMessage): Promise<void> {
    const transport = this.transporter();
    if (!transport) {
      throw new MailSendError('SMTP_URL is not set', true);
    }
    try {
      await transport.sendMail({ from: this.options.from, ...message });
    } catch (error) {
      throw new MailSendError(this.redact(error), isPermanent(error));
    }
  }

  private transporter(): Transporter | null {
    if (!this.url) return null;
    this.transport ??= createTransport({
      url: this.url.toString(),
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    return this.transport;
  }

  /** The error's message with the URL's user and password taken out. */
  private redact(error: unknown): string {
    let text = error instanceof Error ? error.message : String(error);
    for (const secret of [this.url?.password, this.url?.username]) {
      if (!secret) continue;
      for (const form of new Set([secret, decodeURIComponent(secret)])) {
        text = text.split(form).join('***');
      }
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, ERROR_MAX);
  }
}

/** nodemailer's `responseCode`: a 5xx reply is a refusal, not a hiccup. */
const isPermanent = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { responseCode?: unknown }).responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
};
