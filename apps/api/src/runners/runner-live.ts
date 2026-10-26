import {
  RUNNER_UPDATED_EVENT,
  type RunnerStatus,
  type RunnerUpdatedEvent,
} from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';
import { LiveService } from '../live/live.service';

/**
 * Tells the `admin` topic a runner changed (C-479): Admin › Runners, the
 * runner sheet and the Connect dialog refetch on it instead of polling.
 * Each change publishes once, from the place that makes it.
 */
@Injectable()
export class RunnerLive {
  private readonly logger = new Logger(RunnerLive.name);

  constructor(private readonly live: LiveService) {}

  updated(runnerId: string, status: RunnerStatus): void {
    const data: RunnerUpdatedEvent = { runnerId, status };
    try {
      this.live.publish('admin', RUNNER_UPDATED_EVENT, data);
    } catch (error) {
      // Best effort: the change itself already happened.
      this.logger.warn(
        `runner ${runnerId}: ${RUNNER_UPDATED_EVENT} not published: ${(error as Error).message}`,
      );
    }
  }
}
