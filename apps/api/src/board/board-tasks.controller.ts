import type { BoardCardDetail } from '@nautelle/shared';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { BoardService } from './board.service';
import { BoardTasks } from './board-tasks';
import type { BoardActor } from './board-work';
import {
  AddTaskChecklistItemDto,
  TaskDoneDto,
  UpdateTaskChecklistItemDto,
} from './dto';

const actorOf = (
  access: ResolvedProjectAccess,
  user: AuthUser,
  ctx: AuditContext,
): BoardActor => ({ userId: user.id, role: access.role, ctx });

/**
 * C-509 (ADR-0127): what only a task card has — its checklist, Done and
 * Reopen. An operator edits the checklist; ticking it, Done and Reopen are
 * also the assignee's, whatever their role (D5), which the service checks.
 * Each answers the task's detail. A project the caller cannot see is 404.
 */
@Controller('projects/:projectId/board/cards/:number')
@UseGuards(ProjectAccessGuard)
export class BoardTasksController {
  constructor(
    private readonly board: BoardService,
    private readonly tasks: BoardTasks,
  ) {}

  @Post('checklist')
  @ProjectRole('operator')
  async addItem(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
    @Body() dto: AddTaskChecklistItemDto,
  ): Promise<BoardCardDetail> {
    const card = cardNumber(number);
    await this.tasks.addItem(
      access.projectId,
      card,
      dto,
      actorOf(access, user, ctx),
    );
    return this.board.detail(access.projectId, card, access.role);
  }

  @Patch('checklist/:itemId')
  @ProjectRole('viewer')
  async updateItem(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTaskChecklistItemDto,
  ): Promise<BoardCardDetail> {
    const card = cardNumber(number);
    await this.tasks.updateItem(
      access.projectId,
      card,
      itemId,
      dto,
      actorOf(access, user, ctx),
    );
    return this.board.detail(access.projectId, card, access.role);
  }

  @Delete('checklist/:itemId')
  @ProjectRole('operator')
  async removeItem(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
    @Param('itemId') itemId: string,
  ): Promise<BoardCardDetail> {
    const card = cardNumber(number);
    await this.tasks.removeItem(
      access.projectId,
      card,
      itemId,
      actorOf(access, user, ctx),
    );
    return this.board.detail(access.projectId, card, access.role);
  }

  @Post('done')
  @HttpCode(200)
  @ProjectRole('viewer')
  async done(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
    @Body() dto: TaskDoneDto,
  ): Promise<BoardCardDetail> {
    const card = cardNumber(number);
    await this.tasks.done(
      access.projectId,
      card,
      dto.note,
      actorOf(access, user, ctx),
    );
    return this.board.detail(access.projectId, card, access.role);
  }

  @Post('reopen')
  @HttpCode(200)
  @ProjectRole('viewer')
  async reopen(
    @ProjectAccess() access: ResolvedProjectAccess,
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Param('number') number: string,
  ): Promise<BoardCardDetail> {
    const card = cardNumber(number);
    await this.tasks.reopen(access.projectId, card, actorOf(access, user, ctx));
    return this.board.detail(access.projectId, card, access.role);
  }
}
