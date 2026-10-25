import { mailOptionsFromEnv, parseSmtpUrl } from './mail-options';

describe('mailOptionsFromEnv (C-404)', () => {
  it('is off without SMTP_URL', () => {
    expect(mailOptionsFromEnv({})).toEqual({
      smtpUrl: null,
      from: 'Nautelle <nautelle@localhost>',
      appUrl: null,
      autoStart: true,
      intervalMs: 10_000,
    });
  });

  it('reads SMTP_URL, SMTP_FROM and APP_URL', () => {
    expect(
      mailOptionsFromEnv({
        SMTP_URL: ' smtps://user:pw@smtp.example.com ',
        SMTP_FROM: 'Fleet <fleet@example.com>',
        APP_URL: 'https://nautelle.example.com//',
        APP_ENV: 'test',
      }),
    ).toMatchObject({
      smtpUrl: 'smtps://user:pw@smtp.example.com',
      from: 'Fleet <fleet@example.com>',
      appUrl: 'https://nautelle.example.com',
      autoStart: false,
    });
  });

  it('sends from the SMTP user when it is an address and SMTP_FROM is unset', () => {
    expect(
      mailOptionsFromEnv({
        SMTP_URL: 'smtp://bot%40example.com:pw@smtp.example.com:587',
      }).from,
    ).toBe('Nautelle <bot@example.com>');
    expect(
      mailOptionsFromEnv({ SMTP_URL: 'smtp://apikey:pw@smtp.example.com' })
        .from,
    ).toBe('Nautelle <nautelle@localhost>');
  });
});

describe('parseSmtpUrl', () => {
  it.each([
    ['smtp://smtp.example.com:587', true],
    ['smtps://u:p@smtp.example.com', true],
    ['https://smtp.example.com', false],
    ['smtp://', false],
    ['not a url', false],
    [null, false],
  ])('%s → %s', (raw, ok) => {
    expect(parseSmtpUrl(raw) !== null).toBe(ok);
  });
});
