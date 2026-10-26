import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CryptoModule } from '../common/crypto';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { ApiTokenScopeInterceptor } from './api-token-scope.interceptor';
import {
  AdminApiTokensController,
  ApiTokensController,
} from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { RolesGuard } from './guards/roles.guard';
import { SessionGuard } from './guards/session.guard';
import { LoginThrottle } from './login-throttle';
import { LoginThrottleAlerts } from './login-throttle-alerts';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    SettingsModule,
    CryptoModule,
    // C-402: Forgot password emails the reset link.
    MailModule,
    // Applied only where `@UseGuards(ThrottlerGuard)` asks: login, register
    // (spec D8) and the password change (C-109).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [
    AuthController,
    ApiTokensController,
    AdminApiTokensController,
    PasswordResetController,
  ],
  providers: [
    AuthService,
    SessionService,
    ApiTokensService,
    LoginThrottle,
    LoginThrottleAlerts,
    TwoFactorService,
    PasswordResetService,
    // Global guards run in this order: who you are, then CSRF, then your role.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // C-403: after every guard, a project-limited token's last check.
    { provide: APP_INTERCEPTOR, useClass: ApiTokenScopeInterceptor },
  ],
  exports: [
    SessionService,
    LoginThrottleAlerts,
    TwoFactorService,
    PasswordResetService,
  ],
})
export class AuthModule {}
