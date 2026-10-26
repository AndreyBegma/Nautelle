import type {
  AdminUser,
  AdminUsersPage,
  PasswordResetLinkResponse,
  RegistrationState,
  TwoFactorPolicy,
} from '@nautelle/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuditContext } from '../audit/audit.types';
import { AuditCtx } from '../audit/audit-context';
import type { AuthUser } from '../auth/auth-request';
import { CurrentUser, Roles, SessionOnly } from '../auth/decorators';
import { CreatePasswordResetLinkDto, TwoFactorPolicyDto } from '../auth/dto';
import { PasswordResetService } from '../auth/password-reset.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { SettingsService } from '../settings/settings.service';
import { AdminUsersService } from './admin-users.service';
import {
  ApproveUserDto,
  ListUsersQuery,
  RegistrationStateDto,
  UpdateUserDto,
} from './dto';

@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly resets: PasswordResetService,
  ) {}

  @Get()
  list(@Query() query: ListUsersQuery): Promise<AdminUsersPage> {
    return this.users.list(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveUserDto,
    @CurrentUser() admin: AuthUser,
    @AuditCtx() ctx: AuditContext,
  ): Promise<AdminUser> {
    return this.users.approve(id, dto.role, admin.id, ctx);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id') id: string,
    @AuditCtx() ctx: AuditContext,
  ): Promise<AdminUser> {
    return this.users.reject(id, ctx);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @AuditCtx() ctx: AuditContext,
  ): Promise<AdminUser> {
    return this.users.update(id, dto, ctx);
  }

  @Delete(':id/two-factor')
  resetTwoFactor(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
    @AuditCtx() ctx: AuditContext,
  ): Promise<AdminUser> {
    return this.users.resetTwoFactor(id, admin.id, ctx);
  }

  /**
   * C-402: a one-time link that sets a new password (and, for `two_factor`,
   * turns two-factor sign-in off), shown once. A browser session only: a
   * leaked API token must not hand out the way into other accounts.
   */
  @SessionOnly()
  @Post(':id/reset-link')
  createResetLink(
    @Param('id') id: string,
    @Body() dto: CreatePasswordResetLinkDto,
    @CurrentUser() admin: AuthUser,
    @AuditCtx() ctx: AuditContext,
  ): Promise<PasswordResetLinkResponse> {
    return this.resets.issueByAdmin(id, dto.kind, admin.id, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @AuditCtx() ctx: AuditContext,
  ): Promise<void> {
    return this.users.remove(id, ctx);
  }
}

@Roles('admin')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Get('registration')
  async registration(): Promise<RegistrationState> {
    return { open: await this.settings.isRegistrationOpen() };
  }

  @Put('registration')
  async setRegistration(
    @Body() dto: RegistrationStateDto,
    @CurrentUser() admin: AuthUser,
    @AuditCtx() ctx: AuditContext,
  ): Promise<RegistrationState> {
    return {
      open: await this.settings.setRegistrationOpen(dto.open, admin.id, ctx),
    };
  }

  @Get('two-factor')
  async twoFactorPolicy(): Promise<TwoFactorPolicy> {
    return { requiredForAdmins: await this.twoFactor.requiredForAdmins() };
  }

  @Put('two-factor')
  async setTwoFactorPolicy(
    @Body() dto: TwoFactorPolicyDto,
    @CurrentUser() admin: AuthUser,
    @AuditCtx() ctx: AuditContext,
  ): Promise<TwoFactorPolicy> {
    return {
      requiredForAdmins: await this.twoFactor.setRequiredForAdmins(
        dto.requiredForAdmins,
        admin.id,
        ctx,
      ),
    };
  }
}
