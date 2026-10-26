import type {
  CardLabelView,
  LabelPathRuleView,
  ProjectLabelsResponse,
  ProjectLabelView,
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
  UseGuards,
} from '@nestjs/common';
import { AuditCtx } from '../audit';
import type { AuditContext } from '../audit/audit.types';
import { type AuthUser, CurrentUser } from '../auth';
import {
  ProjectAccess,
  ProjectAccessGuard,
  ProjectRole,
  type ResolvedProjectAccess,
} from '../projects';
import { cardNumber } from './board.controller';
import { BoardLabels } from './board-labels.service';
import {
  CreateProjectLabelDto,
  ReplaceLabelRulesDto,
  SetCardLabelsDto,
  UpdateProjectLabelDto,
} from './dto';

/**
 * C-497 (ADR-0125): a project's card labels. Viewers read them; a project
 * admin edits the labels and their path rules; an operator sets a card's
 * labels. A project the caller cannot see is 404 on every route.
 */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
export class BoardLabelsController {
  constructor(private readonly labels: BoardLabels) {}

  @Get('labels')
  view(
    @ProjectAccess() access: ResolvedProjectAccess,
  ): Promise<ProjectLabelsResponse> {
    return this.labels.view(access.projectId);
  }

  @Post('labels')
  @ProjectRole('admin')
  create(
    @ProjectAccess() access: ResolvedProjectAccess,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: CreateProjectLabelDto,
  ): Promise<ProjectLabelView> {
    return this.labels.create(access.projectId, dto, ctx);
  }

  @Put('labels/rules')
  @ProjectRole('admin')
  replaceRules(
    @ProjectAccess() access: ResolvedProjectAccess,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: ReplaceLabelRulesDto,
  ): Promise<LabelPathRuleView[]> {
    return this.labels.replaceRules(access.projectId, dto.rules, ctx);
  }

  @Patch('labels/:labelId')
  @ProjectRole('admin')
  update(
    @ProjectAccess() access: ResolvedProjectAccess,
    @AuditCtx() ctx: AuditContext,
    @Param('labelId') labelId: string,
    @Body() dto: UpdateProjectLabelDto,
  ): Promise<ProjectLabelView> {
    return this.labels.update(access.projectId, labelId, dto, ctx);
  }

  @Delete('labels/:labelId')
  @HttpCode(204)
  @ProjectRole('admin')
  remove(
    @ProjectAccess() access: ResolvedProjectAccess,
    @AuditCtx() ctx: AuditContext,
    @Param('labelId') labelId: string,
  ): Promise<void> {
    return this.labels.remove(access.projectId, labelId, ctx);
  }

  @Put('board/cards/:number/labels')
  @ProjectRole('operator')
  setCard(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
    @Body() dto: SetCardLabelsDto,
  ): Promise<CardLabelView[]> {
    return this.labels.setCard(
      access.projectId,
      cardNumber(number),
      dto.labelIds,
      {
        userId: user.id,
        role: access.role,
        ctx,
      },
    );
  }
}
