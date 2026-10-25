import type {
  AdminApiTokenView,
  ApiTokenView,
  CreatedApiToken,
} from '@nautelle/shared';
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { AuditContext } from '../audit/audit.types';
import { AuditCtx } from '../audit/audit-context';
import { ApiTokensService } from './api-tokens.service';
import type { AuthUser } from './auth-request';
import { CurrentUser, Roles, SessionOnly } from './decorators';
import { CreateApiTokenDto } from './dto';

/**
 * C-403: Account › API tokens. Session only: a token never makes, lists or
 * revokes tokens, so a narrow token cannot mint a wider one.
 */
@SessionOnly()
@Controller('auth/api-tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ApiTokenView[]> {
    return this.tokens.listOwn(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApiTokenDto,
    @AuditCtx() ctx: AuditContext,
  ): Promise<CreatedApiToken> {
    return this.tokens.create(user, dto, ctx);
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @AuditCtx() ctx: AuditContext,
  ): Promise<ApiTokenView> {
    return this.tokens.revoke(id, user.id, user, ctx);
  }
}

/** C-403: an admin sees and revokes every user's tokens. */
@SessionOnly()
@Roles('admin')
@Controller('admin/api-tokens')
export class AdminApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  list(): Promise<AdminApiTokenView[]> {
    return this.tokens.listAll();
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @AuditCtx() ctx: AuditContext,
  ): Promise<ApiTokenView> {
    return this.tokens.revoke(id, null, user, ctx);
  }
}
