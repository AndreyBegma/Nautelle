import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../database/prisma.service';
import {
  NOTIFICATION_OPTIONS,
  type NotificationOptions,
} from './notification-options';

/** Daily, after the activity retention. */
const RETENTION_CRON = '45 4 * * *';
const JOB_NAME = 'notification-retention';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NotificationRetentionResult {
  notifications: number;
  slackDeliveries: number;
}

/**
 * C-482: deletes notifications whose `lastAt` is older than
 * `NOTIFICATION_RETENTION_DAYS`, read or not; their `notification_deliveries`
 * go with them (cascade). Slack deliveries older than the same limit go too,
 * except a pending one that is due: a queued message is never dropped. Rows go
 * in batches of ids so one sweep never holds a long lock. Registered on
 * `SchedulerRegistry`, so Admin › Schedules lists it among the system jobs.
 */
@Injectable()
export class NotificationRetentionJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationRetentionJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    @Inject(NOTIFICATION_OPTIONS) private readonly options: NotificationOptions,
  ) {}

  onApplicationBootstrap(): void {
    const job = CronJob.from({
      cronTime: RETENTION_CRON,
      onTick: () => this.run(),
    });
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
  }

  /** One sweep; returns how many rows of each kind it deleted. */
  async sweep(now: Date = new Date()): Promise<NotificationRetentionResult> {
    const before = new Date(
      now.getTime() - this.options.retentionDays * DAY_MS,
    );
    const batch = this.options.retentionBatch;

    let notifications = 0;
    for (;;) {
      const rows = await this.prisma.notification.findMany({
        where: { lastAt: { lt: before } },
        select: { id: true },
        take: batch,
      });
      if (rows.length === 0) break;
      const { count } = await this.prisma.notification.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      notifications += count;
      if (rows.length < batch) break;
    }

    let slackDeliveries = 0;
    const settled = {
      createdAt: { lt: before },
      NOT: { status: 'pending' as const, nextAttemptAt: { lte: now } },
    };
    for (;;) {
      const rows = await this.prisma.slackDelivery.findMany({
        where: settled,
        select: { id: true },
        take: batch,
      });
      if (rows.length === 0) break;
      const { count } = await this.prisma.slackDelivery.deleteMany({
        where: { id: { in: rows.map((row) => row.id) }, ...settled },
      });
      slackDeliveries += count;
      if (rows.length < batch) break;
    }

    return { notifications, slackDeliveries };
  }

  private async run(): Promise<void> {
    try {
      const { notifications, slackDeliveries } = await this.sweep();
      if (notifications + slackDeliveries > 0)
        this.logger.log(
          `deleted ${notifications} notifications and ${slackDeliveries} Slack deliveries older than ${this.options.retentionDays} days`,
        );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`notification retention failed: ${reason}`);
    }
  }
}
