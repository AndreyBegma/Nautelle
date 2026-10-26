import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PASSWORD_RESET_KINDS, type PasswordResetKind } from '@nautelle/shared';
import { Global, HttpException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { LoginThrottle } from '../auth/login-throttle';
import { LoginThrottleAlerts } from '../auth/login-throttle-alerts';
import { PasswordResetService } from '../auth/password-reset.service';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { CryptoModule } from '../common/crypto';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { MailService } from '../mail/mail.service';
import { SettingsModule } from '../settings/settings.module';

/**
 * `bun run admin:recover -- --email <e> [--kind password|two_factor]`, or
 * `node dist/src/cli/admin-recover.js …` in the image (C-484): prints a
 * one-time link that gets a locked-out admin back in. It is
 * `PasswordResetService`'s own link, for an active admin only.
 */

class UsageError extends Error {}

/** `AuditModule` without its controller and its scheduled jobs. */
@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
class CliAuditModule {}

/**
 * Just what `PasswordResetService` needs, without the web server, the audit
 * jobs or any other module's schedule.
 */
@Module({
  imports: [
    DatabaseModule,
    CliAuditModule,
    SettingsModule,
    CryptoModule,
    MailModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    SessionService,
    LoginThrottle,
    LoginThrottleAlerts,
    TwoFactorService,
    PasswordResetService,
  ],
})
class AdminRecoverModule {}

const readArgs = (): { email: string; kind: PasswordResetKind } => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      kind: { type: 'string', default: 'two_factor' },
    },
    strict: true,
  });
  const email = values.email?.trim();
  if (!email) throw new UsageError('--email <address> is required');
  const kind = PASSWORD_RESET_KINDS.find((k) => k === values.kind);
  if (!kind) {
    throw new UsageError(
      `--kind is one of: ${PASSWORD_RESET_KINDS.join(', ')}`,
    );
  }
  return { email, kind };
};

async function main() {
  const { email, kind } = readArgs();
  // Errors only, and on stderr: stdout carries the link and nothing else.
  const app = await NestFactory.createApplicationContext(AdminRecoverModule, {
    logger: ['error'],
  });
  try {
    const link = await app.get(PasswordResetService).issueByCli(email, kind);
    // With `APP_URL` the link opens as printed; without, the admin adds the origin.
    console.log(`${app.get(MailService).appUrl ?? ''}${link.path}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof UsageError || error instanceof HttpException
      ? error.message
      : error,
  );
  process.exitCode = 1;
});
