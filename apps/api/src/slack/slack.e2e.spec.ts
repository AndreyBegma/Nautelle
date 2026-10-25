import { createHash } from 'node:crypto';
import type { CardDemoView, SlackWebhookStatus } from '@nautelle/shared';
import { HttpException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  FILES,
  useTempAttachmentsDir,
} from '../attachments/testing/attachments-e2e';
import { AuditService } from '../audit/audit.service';
import { SYSTEM_ACTOR } from '../audit/audit.types';
import { BoardWorld, ROOT_A } from '../board/testing/board-e2e';
import { BudgetSweep } from '../budgets/budget-sweep';
import { Feed, seedSnapshotPrices } from '../budgets/testing/budgets-e2e';
import { SecretCipher } from '../common/crypto';
import { NotificationMatcher } from '../notifications/notification-matcher';
import { resetNotifications } from '../notifications/testing/notifications-e2e';
import {
  generateRunnerToken,
  hashRunnerToken,
  tokenPrefix,
} from '../runners/credentials';
import { ingest } from '../usage/testing/usage-e2e';
import { SlackClient } from './slack-client';
import { SlackDeliveryService } from './slack-delivery.service';
import { SLACK_OPTIONS, type SlackOptions } from './slack-options';
import { SlackWebhooksService } from './slack-webhooks.service';

useTempAttachmentsDir();

const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
const APP_URL = 'https://nautelle.test';
const PROJECT_HOOK = 'https://hooks.slack.com/services/T000/B000/projectAAAA';
const WORKSPACE_HOOK =
  'https://hooks.slack.com/services/T000/B111/workspaceBBBB';

interface Post {
  url: string;
  text: string;
}

const sha256 = (body: Buffer): string =>
  createHash('sha256').update(body).digest('hex');

/**
 * C-405 (ADR-0109): Slack notifications through an incoming webhook — the
 * project and workspace settings, the test send, and a finished card posted
 * from its server event through the notification matcher and the delivery
 * pass, on a fake Slack.
 */
describe('Slack: notifications through an incoming webhook (C-405, e2e)', () => {
  const w = new BoardWorld();
  let matcher: NotificationMatcher;
  let delivery: SlackDeliveryService;
  let options: SlackOptions;
  let posts: Post[];
  /** What the fake Slack answers: `answers` in turn, then `answer`. */
  let answer: { status: number; body: string };
  let answers: { status: number; body: string }[];
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = ENCRYPTION_KEY;
    await w.init();
    matcher = w.ctx.app.get(NotificationMatcher);
    delivery = w.ctx.app.get(SlackDeliveryService);
    options = w.ctx.app.get(SLACK_OPTIONS);
    options.appUrl = APP_URL;
    options.fetch = async (input, init) => {
      posts.push({
        url: String(input),
        text: (JSON.parse(String(init?.body)) as { text: string }).text,
      });
      const { status, body } = answers.shift() ?? answer;
      return new Response(body, { status });
    };
  });
  afterAll(async () => {
    await w.close();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousKey;
  });

  beforeEach(async () => {
    await resetNotifications(w.ctx.prisma);
    await w.reset();
    posts = [];
    answer = { status: 200, body: 'ok' };
    answers = [];
    // The first pass only places the matcher's cursor.
    await matcher.tick();
  });
  afterEach(() => w.work.settled());

  const projectUrl = () => `${w.path()}/slack`;
  const workspaceUrl = '/admin/integrations/slack';
  const configure = async (url: string, body: object) => {
    const response = await w.admin.send('put', url, body);
    expect(response.status).toBe(200);
    return response.body as SlackWebhookStatus;
  };

  /** C-1 run and marked finished (PR #77). */
  const finishedCard = async (demos: object | null = null) => {
    if (demos) {
      expect(
        (await w.admin.send('patch', `${w.path()}/demos/settings`, demos))
          .status,
      ).toBe(200);
    }
    await w.createCard();
    expect((await w.runCard(1)).status).toBe(200);
    expect(
      (await w.operator.send('post', `${w.path()}/board/cards/1/finish`, {}))
        .status,
    ).toBe(200);
    await w.work.settled();
    expect(await w.card(1)).toMatchObject({
      column: 'finished',
      prNumber: 77,
    });
  };
  /** A demo of C-1 requested, then its video uploaded by the runner. */
  const readyDemo = async () => {
    await w.ctx.prisma.boardCard.updateMany({
      where: { projectId: w.a, number: 1 },
      data: { ciState: 'green' },
    });
    const requested = await w.operator.send(
      'post',
      `${w.path()}/board/cards/1/demos`,
    );
    expect(requested.status).toBe(201);
    const token = generateRunnerToken();
    await w.ctx.prisma.runner.update({
      where: { id: w.runnerId },
      data: {
        tokenPrefix: tokenPrefix(token),
        tokenHash: await hashRunnerToken(token),
      },
    });
    const response = await w.ctx
      .http()
      .post(
        `/runner/cards/1/demos/${(requested.body as CardDemoView).id}/video`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'video/mp4')
      .set('x-demo-sha256', sha256(FILES.mp4))
      .set('x-demo-duration-ms', '4200')
      .send(FILES.mp4);
    expect(response.status).toBe(201);
  };
  /** The matcher's passes until it has nothing left, then one Slack pass. */
  const deliver = async () => {
    for (let i = 0; i < 20; i += 1) {
      if ((await matcher.tick()) === 0) break;
    }
    return delivery.tick();
  };
  const cardLink = () => `${APP_URL}/projects/${w.a}/board?card=1`;
  const PR_LINK = '<https://github.com/acme/widget/pull/77|Pull request #77>';

  describe('settings', () => {
    it('saves a project webhook sealed, shows only its last characters and audits without the URL', async () => {
      const empty = await w.viewer.get(projectUrl());
      expect(empty.status).toBe(200);
      expect(empty.body).toMatchObject({
        scope: 'project',
        configured: false,
        urlHint: null,
        events: ['finished', 'demo', 'question', 'failed', 'budget', 'merged'],
        encryptionAvailable: true,
        workspaceFallback: false,
      });

      const saved = await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['merged', 'finished'],
      });
      expect(saved).toMatchObject({
        configured: true,
        urlHint: '…AAAA',
        events: ['finished', 'merged'],
      });
      expect(JSON.stringify(saved)).not.toContain(PROJECT_HOOK);
      const row = await w.ctx.prisma.slackWebhook.findUniqueOrThrow({
        where: { projectId: w.a },
      });
      expect(row.urlCiphertext).not.toContain('hooks.slack.com');

      // A later save without the URL keeps it and changes the events only.
      expect(await configure(projectUrl(), { events: ['demo'] })).toMatchObject(
        { urlHint: '…AAAA', events: ['demo'] },
      );

      const audits = await w.audit('slack.configure');
      expect(audits).toHaveLength(2);
      for (const audit of audits) {
        expect(
          JSON.stringify([audit.before, audit.after, audit.meta]),
        ).not.toContain('hooks.slack.com');
      }
      expect(audits[0]).toMatchObject({
        after: {
          scope: 'project',
          events: ['finished', 'merged'],
          urlChanged: true,
        },
      });
      expect(audits[1]).toMatchObject({
        before: { events: ['finished', 'merged'] },
        after: { events: ['demo'], urlChanged: false },
      });

      const cleared = await w.admin.send('delete', projectUrl());
      expect(cleared.status).toBe(204);
      expect(await w.audit('slack.clear')).toHaveLength(1);
      expect((await w.admin.send('delete', projectUrl())).status).toBe(404);
    });

    it('refuses a missing or foreign URL and unknown events', async () => {
      const missing = await w.admin.send('put', projectUrl(), {
        events: ['finished'],
      });
      expect(missing.status).toBe(400);
      expect(missing.body).toMatchObject({ error: 'slack_url_required' });
      for (const url of [
        'https://evil.test/services/T/B/X',
        'http://hooks.slack.com/services/T/B/X',
      ]) {
        const invalid = await w.admin.send('put', projectUrl(), {
          url,
          events: ['finished'],
        });
        expect(invalid.status).toBe(400);
        expect(invalid.body).toMatchObject({ error: 'slack_url_invalid' });
      }
      expect(
        (
          await w.admin.send('put', projectUrl(), {
            url: PROJECT_HOOK,
            events: ['everything'],
          })
        ).status,
      ).toBe(400);
      expect(await w.ctx.prisma.slackWebhook.count()).toBe(0);
    });

    it('lets only a project admin change it, and only an admin the workspace one', async () => {
      const body = { url: PROJECT_HOOK, events: ['finished'] };
      expect((await w.operator.send('put', projectUrl(), body)).status).toBe(
        403,
      );
      expect((await w.viewer.send('post', `${projectUrl()}/test`)).status).toBe(
        403,
      );
      expect((await w.outsider.get(projectUrl())).status).toBe(404);
      expect((await w.operator.get(workspaceUrl)).status).toBe(403);
      expect((await w.operator.send('put', workspaceUrl, body)).status).toBe(
        403,
      );

      const saved = await configure(workspaceUrl, {
        url: WORKSPACE_HOOK,
        events: ['finished'],
      });
      expect(saved).toMatchObject({ scope: 'workspace', urlHint: '…BBBB' });
      expect(saved.workspaceFallback).toBeUndefined();
      expect((await w.viewer.get(projectUrl())).body).toMatchObject({
        configured: false,
        workspaceFallback: true,
      });
    });

    it('needs the encryption key to store a URL', async () => {
      const keyless = new SlackWebhooksService(
        w.ctx.prisma,
        SecretCipher.fromKeyText(undefined),
        w.ctx.app.get(AuditService),
        delivery,
        options,
      );
      const error = await keyless
        .update(
          { projectId: w.a },
          { url: PROJECT_HOOK, events: ['finished'] },
          null,
          { actor: SYSTEM_ACTOR },
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        error: 'encryption_key_missing',
      });
      expect(await w.ctx.prisma.slackWebhook.count()).toBe(0);
      expect(await keyless.status({ projectId: w.a })).toMatchObject({
        encryptionAvailable: false,
      });
    });

    it('sends a test message, and says what Slack answered when it refuses', async () => {
      expect((await w.admin.send('post', `${projectUrl()}/test`)).status).toBe(
        404,
      );
      await configure(projectUrl(), { url: PROJECT_HOOK, events: [] });

      expect((await w.admin.send('post', `${projectUrl()}/test`)).status).toBe(
        204,
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.url).toBe(PROJECT_HOOK);
      expect(posts[0]?.text).toContain('for widget');

      answer = { status: 404, body: 'no_service' };
      const refused = await w.admin.send('post', `${projectUrl()}/test`);
      expect(refused.status).toBe(502);
      expect(refused.body).toMatchObject({ error: 'slack_rejected' });
      expect(JSON.stringify(refused.body)).toContain('no_service');
    });
  });

  describe('delivery', () => {
    it('posts a finished card to the channel with its PR and a link into Nautelle, once', async () => {
      await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['finished'],
      });
      await finishedCard();

      expect(await deliver()).toBe(1);
      expect(posts).toHaveLength(1);
      const [post] = posts as [Post];
      expect(post.url).toBe(PROJECT_HOOK);
      expect(post.text).toContain(
        `*<${cardLink()}|C-1 "Add login" is finished>*`,
      );
      expect(post.text).toContain('PR #77 is ready for review.');
      expect(post.text).toContain(PR_LINK);
      expect(await w.ctx.prisma.slackDelivery.findFirstOrThrow()).toMatchObject(
        {
          kind: 'card.finished',
          status: 'sent',
          attempts: 1,
          responseCode: 200,
        },
      );
      // Nothing left to send; the settings show the last delivery.
      expect(await deliver()).toBe(0);
      expect((await w.viewer.get(projectUrl())).body).toMatchObject({
        lastDelivery: { status: 'sent', error: null },
      });
    });

    it('posts a ready demo as a second message with the PR and the demo link', async () => {
      await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['finished', 'demo'],
      });
      await finishedCard({ enabled: true });
      await readyDemo();

      expect(await deliver()).toBe(2);
      expect(posts).toHaveLength(2);
      const [finished, demo] = posts as [Post, Post];
      expect(finished.text).toContain('is finished');
      expect(finished.text).not.toContain('Watch the demo');
      expect(demo.text).toContain(PR_LINK);
      expect(demo.text).toContain(`<${cardLink()}|Watch the demo>`);
    });

    it('posts the demo to Slack when the demo is kept off Telegram, and to nobody else', async () => {
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ['demo'] });
      await finishedCard({ enabled: true, telegram: false });
      await readyDemo();

      await deliver();
      expect(posts).toHaveLength(1);
      expect(posts[0]?.text).toContain('Watch the demo');
      expect(
        await w.ctx.prisma.notificationDelivery.count({
          where: { notification: { kind: 'card.demo' } },
        }),
      ).toBe(0);
    });

    it('respects the toggles, and a project webhook replaces the workspace one', async () => {
      await configure(workspaceUrl, {
        url: WORKSPACE_HOOK,
        events: ['finished'],
      });
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ['merged'] });
      await finishedCard();

      // The project's own webhook does not post finished cards; the workspace
      // one is not asked.
      expect(await deliver()).toBe(0);
      expect(posts).toEqual([]);

      // Without the project webhook, the workspace one posts for the project.
      await w.admin.send('delete', projectUrl());
      await w.ctx.prisma.boardCard.updateMany({
        where: { projectId: w.a, number: 1 },
        data: { column: 'todo' },
      });
      await w.createCard();
      expect((await w.runCard(2)).status).toBe(200);
      expect(
        (await w.operator.send('post', `${w.path()}/board/cards/2/finish`, {}))
          .status,
      ).toBe(200);
      await w.work.settled();
      expect(await deliver()).toBe(1);
      expect(posts.map((p) => p.url)).toEqual([WORKSPACE_HOOK]);
    });

    it('retries a server error, and gives up on an answer a retry cannot fix', async () => {
      await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['finished'],
      });
      await finishedCard();

      answer = { status: 500, body: 'Internal Server Error' };
      expect(await deliver()).toBe(1);
      const retried = await w.ctx.prisma.slackDelivery.findFirstOrThrow();
      expect(retried).toMatchObject({
        status: 'pending',
        attempts: 1,
        responseCode: 500,
        error: 'http_500',
      });

      answer = { status: 404, body: 'channel_not_found' };
      expect(await delivery.tick(retried.nextAttemptAt)).toBe(1);
      expect(await w.ctx.prisma.slackDelivery.findFirstOrThrow()).toMatchObject(
        {
          status: 'failed',
          attempts: 2,
          error: 'channel_not_found',
        },
      );
      expect((await w.viewer.get(projectUrl())).body).toMatchObject({
        lastDelivery: { status: 'failed', error: 'channel_not_found' },
      });
    });

    it('a refused message does not stop the next one, nor reach the other channels', async () => {
      await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['finished', 'demo'],
      });
      await finishedCard({ enabled: true });
      await readyDemo();

      answers = [{ status: 404, body: 'no_service' }];
      expect(await deliver()).toBe(2);
      expect(
        (
          await w.ctx.prisma.slackDelivery.findMany({
            orderBy: { createdAt: 'asc' },
          })
        ).map((d) => [d.kind, d.status]),
      ).toEqual([
        ['card.finished', 'failed'],
        ['card.demo', 'sent'],
      ]);
      // The people's own notification of the finished card is there.
      expect(
        await w.ctx.prisma.notification.count({
          where: { kind: 'card.finished' },
        }),
      ).toBeGreaterThan(0);
    });

    it('holds only the delivery it is sending, so a second instance sends the next one, each once', async () => {
      await configure(projectUrl(), {
        url: PROJECT_HOOK,
        events: ['finished', 'demo'],
      });
      await finishedCard({ enabled: true });
      await readyDemo();
      for (let i = 0; i < 20; i += 1) {
        if ((await matcher.tick()) === 0) break;
      }
      expect(await w.ctx.prisma.slackDelivery.count()).toBe(2);

      const other = new SlackDeliveryService(
        w.ctx.prisma,
        w.ctx.app.get(SecretCipher),
        w.ctx.app.get(SlackClient),
        w.ctx.app.get(SchedulerRegistry),
        options,
      );
      // The first post hangs until released; the next ones answer at once.
      const fast = options.fetch;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let sending = () => {};
      const started = new Promise<void>((resolve) => {
        sending = resolve;
      });
      options.fetch = async (input, init) => {
        options.fetch = fast;
        sending();
        await gate;
        return fast(input, init);
      };
      try {
        const start = new Date();
        const first = delivery.tick(start);
        await started;
        // The first instance is sending the finished card; the other one
        // takes the demo, and nothing else.
        expect(await other.tick(start)).toBe(1);
        release();
        expect(await first).toBe(1);

        expect(posts.map((p) => p.text.includes('Watch the demo'))).toEqual([
          true,
          false,
        ]);
        const rows = await w.ctx.prisma.slackDelivery.findMany({
          orderBy: { createdAt: 'asc' },
        });
        expect(rows.map((d) => [d.kind, d.status, d.attempts])).toEqual([
          ['card.finished', 'sent', 1],
          ['card.demo', 'sent', 1],
        ]);
        // The late attempt is timed when it happened, not when its pass began.
        expect(rows[0]?.lastAttemptAt?.getTime()).toBeGreaterThan(
          start.getTime(),
        );
        expect(await delivery.tick()).toBe(0);
        expect(await other.tick()).toBe(0);
        expect(posts).toHaveLength(2);
      } finally {
        options.fetch = fast;
        release();
      }
    });
  });

  describe('every event kind', () => {
    const ALL = ['finished', 'demo', 'question', 'failed', 'budget', 'merged'];
    const round = async () => {
      const card = await w.card(1);
      return { card, runId: card.rounds[0].runId as string };
    };
    const phase = (cardId: string, runId: string, data: object) =>
      w.deliver('card_run.phase_changed', {
        cardId,
        runId,
        projectId: w.a,
        at: new Date().toISOString(),
        ...data,
      });
    /** What was posted, as the kinds of the deliveries sent. */
    const sentKinds = async () =>
      (
        await w.ctx.prisma.slackDelivery.findMany({
          where: { status: 'sent' },
          orderBy: { createdAt: 'asc' },
        })
      ).map((d) => d.kind);

    it('posts a merged pull request once, with its PR', async () => {
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ALL });
      await finishedCard();
      await deliver();
      posts = [];

      const { card } = await round();
      await w.work.markMerged(card.id, 77, null, { complete: false });
      await w.work.markMerged(card.id, 77, null, { complete: false });
      expect(await deliver()).toBe(1);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.text).toContain(
        `*<${cardLink()}|C-1 "Add login" is merged>*`,
      );
      expect(posts[0]?.text).toContain(PR_LINK);
    });

    it('posts a failed round without its error', async () => {
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ALL });
      await w.createCard();
      expect((await w.runCard(1)).status).toBe(200);
      const { card, runId } = await round();
      await phase(card.id, runId, {
        phase: 'failed',
        error: 'worktree exists',
      });

      expect(await deliver()).toBe(1);
      expect(await sentKinds()).toEqual(['card.failed']);
      expect(posts[0]?.text).toContain(
        `*<${cardLink()}|C-1 "Add login" failed>*`,
      );
      expect(posts[0]?.text).not.toContain('worktree');
    });

    it('posts a question the card waits on', async () => {
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ALL });
      await w.createCard();
      expect((await w.runCard(1)).status).toBe(200);
      const { card, runId } = await round();
      await phase(card.id, runId, { phase: 'running' });
      await w.deliver('card_run.question', {
        cardId: card.id,
        runId,
        projectId: w.a,
        at: new Date().toISOString(),
      });

      expect(await deliver()).toBe(1);
      expect(await sentKinds()).toEqual(['card.waiting']);
      expect(posts[0]?.text).toContain(
        `*<${cardLink()}|C-1 "Add login" is waiting for you>*`,
      );
    });

    it('posts a reached budget and the card it paused', async () => {
      await seedSnapshotPrices(w.ctx.prisma);
      await configure(projectUrl(), { url: PROJECT_HOOK, events: ['budget'] });
      await w.createCard();
      expect((await w.runCard(1)).status).toBe(200);
      const card = await w.card(1);
      const run = await w.ctx.prisma.run.findUniqueOrThrow({
        where: { id: card.rounds[0].runId as string },
      });
      const ts = (ms: number) =>
        new Date(run.startedAt.getTime() + ms).toISOString();
      const feed = new Feed();
      const session = card.sessionId as string;
      await ingest(w.ctx, w.runnerId, [
        feed.session(session, `${ROOT_A}-card-1`, ts(1000), {
          projectId: w.a,
        }),
        feed.spend(session, 'r-1', ts(2000)),
      ]);
      await w.ctx.prisma.budget.create({
        data: {
          scope: 'project',
          projectId: w.a,
          period: 'day',
          timezone: 'UTC',
          limitUsd: '1',
          thresholds: [100],
          action: 'stop',
        },
      });
      await w.ctx.app.get(BudgetSweep).sweep();
      await w.work.settled();

      expect(await deliver()).toBe(2);
      expect((await sentKinds()).sort()).toEqual([
        'budget.exceeded',
        'card.paused',
      ]);
      const budgetLink = `${APP_URL}/projects/${w.a}/settings/budget`;
      expect(posts.map((p) => p.text).join('\n')).toContain(
        `*<${budgetLink}|Budget exceeded`,
      );
      expect(posts.map((p) => p.text).join('\n')).toContain(cardLink());
    });
  });
});
