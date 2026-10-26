import type { SlackWebhookStatus } from '@nautelle/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuditContext } from '../audit/audit.types';
import { AuditCtx } from '../audit/audit-context';
import { type AuthUser, CurrentUser, Roles } from '../auth';
import {
  ProjectAccess,
  ProjectAccessGuard,
  ProjectRole,
  type ResolvedProjectAccess,
} from '../projects';
import { UpdateSlackWebhookDto } from './dto';
import { SlackWebhooksService } from './slack-webhooks.service';

/**
 * A project's Slack webhook (C-405, ADR-0109). Any member reads its status;
 * setting, removing and testing it need the project admin role.
 */
@Controller('projects/:projectId/slack')
@UseGuards(ProjectAccessGuard)
export class ProjectSlackController {
  constructor(private readonly webhooks: SlackWebhooksService) {}

  @Get()
  status(
    @ProjectAccess() access: ResolvedProjectAccess,
  ): Promise<SlackWebhookStatus> {
    return this.webhooks.status({ projectId: access.projectId });
  }

  @Put()
  @ProjectRole('admin')
  update(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: UpdateSlackWebhookDto,
  ): Promise<SlackWebhookStatus> {
    return this.webhooks.update(
      { projectId: access.projectId },
      dto,
      user.id,
      ctx,
    );
  }

  @Delete()
  @HttpCode(204)
  @ProjectRole('admin')
  clear(
    @ProjectAccess() access: ResolvedProjectAccess,
    @AuditCtx() ctx: AuditContext,
  ): Promise<void> {
    return this.webhooks.clear({ projectId: access.projectId }, ctx);
  }

  @Post('test')
  @HttpCode(204)
  @ProjectRole('admin')
  test(@ProjectAccess() access: ResolvedProjectAccess): Promise<void> {
    return this.webhooks.test({ projectId: access.projectId });
  }
}

/** The workspace-wide Slack webhook: every project without its own. Admins only. */
@Roles('admin')
@Controller('admin/integrations/slack')
export class AdminSlackController {
  constructor(private readonly webhooks: SlackWebhooksService) {}

  @Get()
  status(): Promise<SlackWebhookStatus> {
    return this.webhooks.status({ projectId: null });
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: UpdateSlackWebhookDto,
  ): Promise<SlackWebhookStatus> {
    return this.webhooks.update({ projectId: null }, dto, user.id, ctx);
  }

  @Delete()
  @HttpCode(204)
  clear(@AuditCtx() ctx: AuditContext): Promise<void> {
    return this.webhooks.clear({ projectId: null }, ctx);
  }

  @Post('test')
  @HttpCode(204)
  test(): Promise<void> {
    return this.webhooks.test({ projectId: null });
  }
}
