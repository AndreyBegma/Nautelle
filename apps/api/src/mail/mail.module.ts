import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MAIL_OPTIONS, mailOptionsFromEnv } from './mail-options';

/** Outgoing email over `SMTP_URL` (C-404, ADR-0108). */
@Module({
  providers: [
    { provide: MAIL_OPTIONS, useFactory: () => mailOptionsFromEnv() },
    MailService,
  ],
  exports: [MAIL_OPTIONS, MailService],
})
export class MailModule {}
