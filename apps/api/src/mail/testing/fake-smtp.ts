import { once } from 'node:events';
import { createServer, type Server, type Socket } from 'node:net';

/** One email the fake server took. */
export interface CapturedEmail {
  from: string;
  to: string[];
  /** The raw message as sent after DATA: headers, a blank line, the body. */
  raw: string;
  /** The `Subject:` header, decoded when it is RFC 2047 encoded. */
  subject: string;
  /** `raw` with quoted-printable soft breaks and `=3D` undone, for `toContain`. */
  body: string;
}

/**
 * A minimal SMTP server for the e2e suites (C-404): no TLS, `AUTH PLAIN` and
 * `AUTH LOGIN` accepted with any credentials, every message captured. `reply`
 * makes it refuse the next messages at `RCPT TO`, e.g. `550 5.1.1 no such user`.
 */
export class FakeSmtpServer {
  readonly messages: CapturedEmail[] = [];
  /** An SMTP reply to send instead of `250` at `RCPT TO`; null: accept. */
  reply: string | null = null;
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();

  constructor() {
    this.server = createServer((socket) => this.session(socket));
  }

  async start(): Promise<void> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
  }

  get port(): number {
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('the fake SMTP server is not listening');
    }
    return address.port;
  }

  /** `smtp://` URL of the server; `auth` adds `user:password@`. */
  url(auth?: { user: string; password: string }): string {
    const credentials = auth
      ? `${encodeURIComponent(auth.user)}:${encodeURIComponent(auth.password)}@`
      : '';
    return `smtp://${credentials}127.0.0.1:${this.port}`;
  }

  clear(): void {
    this.messages.length = 0;
    this.reply = null;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.server.close();
    await once(this.server, 'close');
  }

  private session(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setEncoding('utf8');
    const write = (line: string) => socket.write(`${line}\r\n`);

    let buffer = '';
    let data: string[] | null = null;
    let authLogin = 0;
    let from = '';
    let to: string[] = [];

    write('220 fake-smtp ready');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let end = buffer.indexOf('\r\n');
      while (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\r\n');

        if (data) {
          if (line !== '.') {
            data.push(line.startsWith('..') ? line.slice(1) : line);
            continue;
          }
          const raw = data.join('\r\n');
          this.messages.push({
            from,
            to,
            raw,
            subject: subjectOf(raw),
            body: raw.replace(/=\r\n/g, '').replace(/=3D/g, '='),
          });
          data = null;
          from = '';
          to = [];
          write('250 2.0.0 queued');
          continue;
        }
        if (authLogin > 0) {
          authLogin -= 1;
          write(authLogin > 0 ? '334 UGFzc3dvcmQ6' : '235 2.7.0 accepted');
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') {
          write('250-fake-smtp');
          write('250-AUTH PLAIN LOGIN');
          write('250 8BITMIME');
        } else if (verb === 'HELO') {
          write('250 fake-smtp');
        } else if (verb === 'AUTH') {
          const [, mechanism, initial] = line.split(' ');
          if (mechanism?.toUpperCase() === 'LOGIN') {
            authLogin = initial ? 1 : 2;
            write(initial ? '334 UGFzc3dvcmQ6' : '334 VXNlcm5hbWU6');
          } else {
            write('235 2.7.0 accepted');
          }
        } else if (verb === 'MAIL') {
          from = address(line);
          to = [];
          write('250 2.1.0 ok');
        } else if (verb === 'RCPT') {
          if (this.reply) {
            write(this.reply);
          } else {
            to.push(address(line));
            write('250 2.1.5 ok');
          }
        } else if (verb === 'DATA') {
          data = [];
          write('354 end with <CRLF>.<CRLF>');
        } else if (verb === 'RSET') {
          from = '';
          to = [];
          write('250 2.0.0 ok');
        } else if (verb === 'NOOP') {
          write('250 2.0.0 ok');
        } else if (verb === 'QUIT') {
          write('221 2.0.0 bye');
          socket.end();
        } else {
          write('502 5.5.2 not implemented');
        }
      }
    });
  }
}

const address = (line: string): string => /<([^>]*)>/.exec(line)?.[1] ?? '';

/** The `Subject:` header, unfolded, with RFC 2047 words decoded. */
const subjectOf = (raw: string): string => {
  const headers = raw.split('\r\n\r\n')[0].replace(/\r\n[ \t]+/g, ' ');
  const value = /^Subject: (.*)$/im.exec(headers)?.[1] ?? '';
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(
      /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,
      (_, _charset: string, encoding: string, text: string) =>
        encoding.toUpperCase() === 'B'
          ? Buffer.from(text, 'base64').toString('utf8')
          : Buffer.from(
              text
                .replace(/_/g, ' ')
                .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
                  String.fromCharCode(Number.parseInt(hex, 16)),
                ),
              'latin1',
            ).toString('utf8'),
    );
};
