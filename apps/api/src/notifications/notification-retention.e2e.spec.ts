import { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationRetentionJob } from './notification-retention.job';
import {
  createNotificationsApp,
  type NotificationsE2e,
  resetNotifications,
  seedRunnerProject,
  seedUser,
} from './testing/notifications-e2e';

const NOW = new Date('2026-10-26T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('notification retention (e2e)', () => {
  let ctx: NotificationsE2e;
  let job: NotificationRetentionJob;
  let userId: string;
  let projectId: string;
  let webhookId: string;

  /** `n` notifications last touched at `at`, each with a Telegram delivery. */
  const notifications = async (n: number, at: Date) => {
    const rows = Array.from({ length: n }, (_, i) => ({
      userId,
      kind: 'pane.prompt',
      projectId,
      slot: `s${i}`,
      title: `t${i}`,
      body: 'b',
      firstAt: at,
      lastAt: at,
    }));
    await ctx.prisma.notification.createMany({ data: rows });
    const ids = await ctx.prisma.notification.findMany({
      where: { lastAt: at },
      select: { id: true },
    });
    await ctx.prisma.notificationDelivery.createMany({
      data: ids.map(({ id }) => ({
        notificationId: id,
        userId,
        channel: 'telegram' as const,
        status: 'sent' as const,
        createdAt: at,
      })),
    });
  };

  const slack = (
    status: 'pending' | 'sent' | 'failed',
    createdAt: Date,
    nextAttemptAt: Date,
  ) =>
    ctx.prisma.slackDelivery.create({
      data: {
        webhookId,
        projectId,
        kind: 'pane.prompt',
        message: {},
        status,
        createdAt,
        nextAttemptAt,
      },
    });

  beforeAll(async () => {
    ctx = await createNotificationsApp();
    job = ctx.app.get(NotificationRetentionJob);
  });
  afterAll(() => ctx.app.close());

  beforeEach(async () => {
    ctx.options.retentionDays = 90;
    ctx.options.retentionBatch = 5_000;
    await resetNotifications(ctx.prisma);
    ({ projectId } = await seedRunnerProject(ctx.prisma));
    userId = (await seedUser(ctx.prisma, 'ada@example.com', 'admin')).id;
    webhookId = (
      await ctx.prisma.slackWebhook.create({
        data: {
          projectId,
          urlCiphertext: 'sealed',
          urlHint: 'abcd',
          events: [],
        },
      })
    ).id;
  });

  it('is listed among the scheduler registry jobs', () => {
    const registry = ctx.app.get(SchedulerRegistry);
    expect(registry.getCronJob('notification-retention').cronTime.source).toBe(
      '45 4 * * *',
    );
  });

  it('deletes old notifications with their deliveries and keeps new ones', async () => {
    await notifications(3, daysAgo(91));
    await notifications(2, daysAgo(89));

    expect(await job.sweep(NOW)).toEqual({
      notifications: 3,
      slackDeliveries: 0,
    });

    expect(await ctx.prisma.notification.count()).toBe(2);
    expect(await ctx.prisma.notificationDelivery.count()).toBe(2);
    expect(
      await ctx.prisma.notification.count({
        where: { lastAt: { lt: daysAgo(90) } },
      }),
    ).toBe(0);
  });

  it('deletes an old notification whether read or not', async () => {
    await notifications(2, daysAgo(120));
    await ctx.prisma.notification.updateMany({
      data: { readAt: daysAgo(119) },
      where: { slot: 's0' },
    });

    await job.sweep(NOW);

    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('follows NOTIFICATION_RETENTION_DAYS', async () => {
    await notifications(1, daysAgo(10));
    await job.sweep(NOW);
    expect(await ctx.prisma.notification.count()).toBe(1);

    ctx.options.retentionDays = 7;
    await job.sweep(NOW);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('deletes old Slack deliveries but keeps new ones and due pending ones', async () => {
    const old = daysAgo(100);
    const sent = await slack('sent', old, old);
    const failed = await slack('failed', old, old);
    const duePending = await slack('pending', old, daysAgo(1));
    const dueNow = await slack('pending', old, NOW);
    const recent = await slack('sent', daysAgo(5), daysAgo(5));

    expect(await job.sweep(NOW)).toMatchObject({ slackDeliveries: 2 });

    const left = await ctx.prisma.slackDelivery.findMany({
      select: { id: true },
    });
    expect(left.map((row) => row.id).sort()).toEqual(
      [duePending.id, dueNow.id, recent.id].sort(),
    );
    expect(left.map((row) => row.id)).not.toContain(sent.id);
    expect(left.map((row) => row.id)).not.toContain(failed.id);
  });

  it('deletes an old pending Slack delivery that is not due yet', async () => {
    await slack('pending', daysAgo(100), new Date(NOW.getTime() + DAY_MS));
    expect(await job.sweep(NOW)).toMatchObject({ slackDeliveries: 1 });
  });

  it('works through 12 000 old notifications in at least three batches', async () => {
    await notifications(12_000, daysAgo(200));
    await notifications(1, daysAgo(1));
    const spy = jest.spyOn(ctx.prisma.notification, 'deleteMany');

    const result = await job.sweep(NOW);

    expect(result.notifications).toBe(12_000);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [args] of spy.mock.calls) {
      const ids = (args?.where?.id as { in: bigint[] }).in;
      expect(ids.length).toBeLessThanOrEqual(5_000);
    }
    expect(await ctx.prisma.notification.count()).toBe(1);
    expect(await ctx.prisma.notificationDelivery.count()).toBe(1);
    spy.mockRestore();
  });

  it('batches Slack deliveries the same way', async () => {
    ctx.options.retentionBatch = 2;
    for (let i = 0; i < 5; i += 1) await slack('sent', daysAgo(100), NOW);
    const spy = jest.spyOn(ctx.prisma.slackDelivery, 'deleteMany');

    expect(await job.sweep(NOW)).toMatchObject({ slackDeliveries: 5 });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(await ctx.prisma.slackDelivery.count()).toBe(0);
    spy.mockRestore();
  });

  it('does nothing when nothing is old', async () => {
    await notifications(2, daysAgo(1));
    expect(await job.sweep(NOW)).toEqual({
      notifications: 0,
      slackDeliveries: 0,
    });
  });
});
