import {
  TOOL_USE_TIMEOUT_MAX_MINUTES,
  TOOL_USE_TIMEOUT_MIN_MINUTES,
  type UpdateUserSettingsRequest,
  type UserSettingsView,
  type WhatsNewView,
} from '@nautelle/shared';
import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { AuditContext } from '../audit/audit.types';
// From their own files: the barrels load `AuditModule` and `AuthModule`,
// and `AuthModule` imports this module.
import { AuditCtx } from '../audit/audit-context';
import type { AuthUser } from '../auth/auth-request';
import { CurrentUser } from '../auth/decorators';
import { UserSettingsService } from './user-settings.service';

/**
 * `PUT /me/settings`: at least one field (the service checks), each `null`
 * for its default.
 */
export class UpdateUserSettingsDto implements UpdateUserSettingsRequest {
  /** A catalog alias. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  planningModel?: string | null;

  /** C-401: minutes a tool-use request of the caller's sessions waits. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(TOOL_USE_TIMEOUT_MIN_MINUTES)
  @Max(TOOL_USE_TIMEOUT_MAX_MINUTES)
  toolUseTimeoutMinutes?: number | null;
}

/**
 * The caller's own settings (#337 D9). Any signed-in person; the row is the
 * caller's, so no role is involved and nobody reads anyone else's.
 */
@Controller('me')
export class MeSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get('settings')
  get(@CurrentUser() user: AuthUser): Promise<UserSettingsView> {
    return this.settings.get(user.id);
  }

  @Put('settings')
  update(
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsView> {
    return this.settings.update(user.id, dto, ctx);
  }

  /** C-294: the version and the unread dot of What's new. */
  @Get('whats-new')
  whatsNew(@CurrentUser() user: AuthUser): Promise<WhatsNewView> {
    return this.settings.whatsNew(user.id);
  }

  /** C-294: the caller opened What's new; the dot clears. */
  @Post('whats-new/seen')
  @HttpCode(200)
  markWhatsNewSeen(@CurrentUser() user: AuthUser): Promise<WhatsNewView> {
    return this.settings.markWhatsNewSeen(user.id);
  }
}
