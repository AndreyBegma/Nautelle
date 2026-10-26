import type { PlannerInstructionsView } from '@nautelle/shared';
import { Body, Controller, Get, Put } from '@nestjs/common';
import { AuditCtx } from '../audit';
import type { AuditContext } from '../audit/audit.types';
import { type AuthUser, CurrentUser, Roles } from '../auth';
import { PlannerInstructionsDto } from './dto';
import { PlannerInstructionsService } from './planner-instructions.service';

/** The global planner instructions (D11, ADR-0019): a site admin's. */
@Controller('admin/planner')
@Roles('admin')
export class PlannerAdminController {
  constructor(private readonly instructions: PlannerInstructionsService) {}

  @Get('instructions')
  instructionsView(): Promise<PlannerInstructionsView> {
    return this.instructions.global();
  }

  @Put('instructions')
  update(
    @CurrentUser() user: AuthUser,
    @AuditCtx() ctx: AuditContext,
    @Body() dto: PlannerInstructionsDto,
  ): Promise<PlannerInstructionsView> {
    return this.instructions.updateGlobal(ctx, user.id, dto.body);
  }
}
