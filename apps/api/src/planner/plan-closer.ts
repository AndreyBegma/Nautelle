import { Injectable, Logger } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PlanStore } from './plan-store';
import type { PlanCaller } from './plan-turn.service';
import { PlannerCommands } from './planner-commands';

/**
 * `plan.close`, best effort (D15): the runner removes the plan's worktree. A
 * runner that cannot take the command leaves it to the 14-day idle cleanup.
 * Sent when a plan is archived and when it becomes `done`.
 */
@Injectable()
export class PlanCloser {
  private readonly logger = new Logger(PlanCloser.name);

  constructor(
    private readonly store: PlanStore,
    private readonly commands: PlannerCommands,
  ) {}

  async close(
    plan: Pick<Plan, 'id' | 'projectId'>,
    caller: PlanCaller,
  ): Promise<void> {
    try {
      const project = await this.store.project(plan.projectId);
      const result = await this.commands.send(
        project.runnerId,
        'plan.close',
        { planId: plan.id, projectId: plan.projectId },
        { role: caller.role, ctx: caller.ctx },
      );
      if (result.status !== 'ok') {
        this.logger.warn(`plan ${plan.id}: plan.close ${result.status}`);
      }
    } catch (error) {
      // The plan is already settled; a failed close must not undo or fail it.
      this.logger.warn(
        `plan ${plan.id}: plan.close: ${(error as Error).message}`,
      );
    }
  }
}
