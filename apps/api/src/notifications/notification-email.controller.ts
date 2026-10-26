import type {
  EmailIntegrationStatus,
  NotificationEmailView,
} from '@nautelle/shared';
import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { AuditCtx } from '../audit';
import type { AuditContext } from '../audit/audit.types';
import { type AuthUser, CurrentUser, Roles } from '../auth';
import { NotificationEmailSettingsDto } from './dto';
import { NotificationEmailService } from './notification-email.service';

/** The caller's own email delivery (C-404). No user id in any path. */
@Controller('notifications/email')
export class NotificationEmailController {
  constructor(private readonly email: NotificationEmailService) {}

  @Get()
  settings(@CurrentUser() user: AuthUser): Promise<NotificationEmailView> {
    return this.email.settings(user);
  }

  @Put()
  setSettings(
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: NotificationEmailSettingsDto,
  ): Promise<NotificationEmailView> {
    return this.email.setSettings(user, dto, ctx);
  }
}

/** The SMTP server from `SMTP_URL` (C-404): admins only, read-only. */
@Roles('admin')
@Controller('admin/integrations/email')
export class EmailAdminController {
  constructor(private readonly email: NotificationEmailService) {}

  @Get()
  status(): Promise<EmailIntegrationStatus> {
    return this.email.status();
  }

  @Post('test')
  @HttpCode(204)
  test(@CurrentUser() admin: AuthUser): Promise<void> {
    return this.email.sendTest(admin);
  }
}
