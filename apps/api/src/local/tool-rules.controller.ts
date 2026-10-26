import type { ToolRuleView } from '@nautelle/shared';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuditCtx } from '../audit';
import type { AuditContext } from '../audit/audit.types';
import {
  ProjectAccess,
  ProjectAccessGuard,
  ProjectRole,
  type ResolvedProjectAccess,
} from '../projects';
import { ToolRulesService } from './tool-rules.service';

/**
 * C-401: the project's tool-use rules — "always allow in this project" and
 * the live sessions' "allow similar". Operators store them by deciding a
 * request, so operators list and remove them; a project the caller cannot
 * see is 404.
 */
@Controller('projects/:projectId/tool-rules')
@UseGuards(ProjectAccessGuard)
export class ToolRulesController {
  constructor(private readonly rules: ToolRulesService) {}

  @Get()
  @ProjectRole('operator')
  list(
    @ProjectAccess() access: ResolvedProjectAccess,
  ): Promise<ToolRuleView[]> {
    return this.rules.list(access.projectId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ProjectRole('operator')
  async remove(
    @ProjectAccess() access: ResolvedProjectAccess,
    @Param('id') id: string,
    @AuditCtx() ctx: AuditContext,
  ): Promise<void> {
    if (!(await this.rules.remove(access.projectId, id, ctx))) {
      throw new NotFoundException('Tool rule not found');
    }
  }
}
