import { APPROVAL_SWEEP_MS } from '@nautelle/shared';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

/**
 * C-389 (ADR-0099): runs `ApprovalsService.sweep` every `APPROVAL_SWEEP_MS`,
 * so an approval whose PR merged or closed without an event leaves Needs
 * you by itself. Not started under tests, which call `sweep` themselves.
 */
@Injectable()
export class ApprovalsSweep implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalsSweep.name);
  private timer: NodeJS.Timeout | undefined;
  private sweeping = false;

  constructor(private readonly approvals: ApprovalsService) {}

  onApplicationBootstrap(): void {
    if (process.env.APP_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), APPROVAL_SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.approvals.sweep();
    } catch (error) {
      this.logger.error(
        'the approvals sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.sweeping = false;
    }
  }
}
