import { captureFingerprint } from '@nautelle/shared';
import type { BoardColumn, CardEffort, PrismaClient } from '@prisma/client';

/**
 * The database a demo recording runs on (C-383, ADR-0090): `agentdock_demo`,
 * or `agentdock_demo_<id>` for a card worktree. Only such a name is ever
 * created or dropped, so a wrong argument cannot touch the dev database.
 */
const DEMO_DATABASE = /^agentdock_demo(_[a-z0-9]{1,40})?$/;

export class DemoDataError extends Error {}

export const isDemoDatabase = (name: string): boolean =>
  DEMO_DATABASE.test(name);

/** `base` with its database replaced by `name`; every other part is kept. */
export const demoDatabaseUrl = (base: string, name: string): string => {
  if (!isDemoDatabase(name)) {
    throw new DemoDataError(`Not a demo database name: ${name}`);
  }
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
};

/** The maintenance database on the server of `url`, without query options. */
export const maintenanceUrl = (url: string): string => {
  const server = new URL(url);
  server.pathname = '/postgres';
  server.search = '';
  return server.toString();
};

export const DEMO_RUNNER_ID = 'demo-runner';
export const DEMO_PROJECT_ID = 'demo-project';

/**
 * C-398 (ADR-0102): the demo Board runs one card worker at a time, so the
 * running card fills it and the queued cards wait for a slot.
 */
export const DEMO_MAX_RUNNING = 1;

/** The cards of the demo Board: a few in each working column. */
export const DEMO_CARDS: ReadonlyArray<{
  title: string;
  column: BoardColumn;
  kind: 'feature' | 'bug';
  /**
   * C-359: round 1 launched with this model and effort. It finished, or
   * (C-399) a hard budget paused it, or (C-398) a worker is still at it.
   */
  round?: {
    model: string;
    effort: CardEffort;
    paused?: true;
    running?: true;
  };
  /** C-398: Run was pressed on a full Board; the card waits for a slot. */
  queued?: true;
  /**
   * C-389: a PR recorded as merged into the project base while the card sat
   * in Finished — the API's sweep moves it to Completed by itself.
   */
  mergedPr?: number;
}> = [
  {
    title: 'Export the activity feed as CSV',
    column: 'todo',
    kind: 'feature',
    queued: true,
  },
  {
    title: 'Dark mode for the settings page',
    column: 'todo',
    kind: 'feature',
    queued: true,
  },
  {
    title: 'Board search misses cards with emoji',
    column: 'todo',
    kind: 'bug',
  },
  {
    title: 'Show the runner version in the header',
    column: 'in_progress',
    kind: 'feature',
    round: { model: 'claude-sonnet-5-5', effort: 'medium', running: true },
  },
  {
    title: 'Retry a failed collect from the card',
    column: 'finished',
    kind: 'feature',
    round: { model: 'claude-opus-5-5', effort: 'high' },
  },
  {
    title: 'Coupon codes at checkout',
    column: 'finished',
    kind: 'feature',
    mergedPr: 42,
  },
  {
    title: 'Import products from a CSV file',
    column: 'in_progress',
    kind: 'feature',
    round: { model: 'claude-sonnet-5-5', effort: 'medium', paused: true },
  },
];

/**
 * C-389: runs that failed an hour ago. Needs you lists the card's; the
 * Steward's is a service failure, so it stays in the project's history only.
 */
export const DEMO_FAILED_RUNS: ReadonlyArray<{
  id: string;
  kind: 'card' | 'steward';
  title: string;
  trigger: 'user' | 'schedule';
}> = [
  {
    id: 'demo-run-failed-card',
    kind: 'card',
    title: 'C-2 Dark mode for the settings page',
    trigger: 'user',
  },
  {
    id: 'demo-run-failed-steward',
    kind: 'steward',
    title: 'Steward digest',
    trigger: 'schedule',
  },
];

/**
 * Seeds the demo project and its cards for the admin `adminEmail`, who must
 * exist (`bun run admin:create`). Every row has a fixed key, so running it
 * again changes nothing.
 */
export const seedDemo = async (
  prisma: Pick<
    PrismaClient,
    | 'user'
    | 'runner'
    | 'project'
    | 'boardSettings'
    | 'repositoryPushCheck'
    | 'boardCard'
    | 'run'
    | 'boardCardRound'
    | 'boardRunQueueCard'
  >,
  adminEmail: string,
): Promise<{ projectId: string; cards: number }> => {
  const email = adminEmail.trim().toLowerCase();
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) throw new DemoDataError(`No user with email ${email}`);

  const now = new Date();
  await prisma.runner.upsert({
    where: { id: DEMO_RUNNER_ID },
    update: {},
    create: {
      id: DEMO_RUNNER_ID,
      name: 'Demo runner',
      createdById: admin.id,
      localUserId: admin.id,
    },
  });
  await prisma.project.upsert({
    where: { id: DEMO_PROJECT_ID },
    update: {},
    create: {
      id: DEMO_PROJECT_ID,
      runnerId: DEMO_RUNNER_ID,
      rootPath: '/srv/demo/acme-shop',
      repo: 'acme/shop',
      displayName: 'Acme Shop',
      baseBranch: 'develop',
      baseSource: 'default',
      defaultBranch: 'main',
      hasClaudeMd: true,
      hasAgentsMd: false,
      // C-395: what the Ready to run block reads; the runner stays offline.
      hasDemoflowConfig: true,
      lastInspectedAt: now,
      createdById: admin.id,
      members: { create: { userId: admin.id, addedById: admin.id } },
    },
  });
  // C-395: the push check Ready to run reads (C-396 keeps it per runner and path).
  await prisma.repositoryPushCheck.upsert({
    where: {
      runnerId_rootPath: {
        runnerId: DEMO_RUNNER_ID,
        rootPath: '/srv/demo/acme-shop',
      },
    },
    update: {},
    create: {
      runnerId: DEMO_RUNNER_ID,
      rootPath: '/srv/demo/acme-shop',
      ok: true,
      remote: 'git@github.com:acme/shop.git',
      message: 'origin accepts pushes from this checkout.',
      checkedAt: now,
    },
  });
  await prisma.boardSettings.upsert({
    where: { projectId: DEMO_PROJECT_ID },
    update: {},
    create: { projectId: DEMO_PROJECT_ID, maxRunning: DEMO_MAX_RUNNING },
  });

  for (const [index, card] of DEMO_CARDS.entries()) {
    const number = index + 1;
    const created = await prisma.boardCard.upsert({
      where: { projectId_number: { projectId: DEMO_PROJECT_ID, number } },
      update: {},
      create: {
        projectId: DEMO_PROJECT_ID,
        number,
        shortId: `demo${String(number).padStart(4, '0')}`,
        title: card.title,
        fingerprint: captureFingerprint(card.title),
        kind: card.kind,
        kindSource: 'person',
        column: card.column,
        position: number,
        issueOnRun: card.kind === 'bug',
        specOnRun: false,
        createdById: admin.id,
        movedById: admin.id,
        movedAt: now,
        // C-399: a paused card keeps its worktree branch and its session.
        ...(card.round?.paused
          ? {
              branch: `card/c${number}-import-products-from-a-csv-file`,
              sessionId: '0000c399-0000-4000-8000-000000000007',
            }
          : {}),
        ...(card.mergedPr === undefined
          ? {}
          : {
              branch: `card/c${number}-coupon-codes`,
              prNumber: card.mergedPr,
              prUrl: `https://github.com/acme/shop/pull/${card.mergedPr}`,
              prState: 'merged' as const,
              mergedAt: new Date(now.getTime() - 10 * 60_000),
            }),
      },
    });
    if (card.queued) {
      await prisma.boardRunQueueCard.upsert({
        where: { cardId: created.id },
        update: {},
        create: {
          cardId: created.id,
          status: 'queued',
          queuedById: admin.id,
          queuedByRole: 'admin',
        },
      });
    }
    if (card.round) {
      const running = card.round.running === true;
      const paused = card.round.paused === true;
      const runId = `demo-run-${number}`;
      const startedAt = new Date(now.getTime() - 20 * 60_000);
      await prisma.run.upsert({
        where: { id: runId },
        update: {},
        create: {
          id: runId,
          kind: 'card',
          projectId: DEMO_PROJECT_ID,
          title: `C-${number} ${card.title}`,
          runtime: 'claude',
          model: card.round.model,
          args: { card: number, round: 1, trigger: 'run' },
          status: running ? 'running' : paused ? 'abandoned' : 'succeeded',
          ...(paused ? { outcome: 'Paused: a hard budget was reached' } : {}),
          triggeredByType: 'user',
          triggeredById: admin.id,
          startedAt,
          endedAt: running ? null : now,
          updatedAt: now,
        },
      });
      await prisma.boardCardRound.upsert({
        where: { runId },
        update: {},
        create: {
          cardId: created.id,
          round: 1,
          runId,
          trigger: 'run',
          cardTitle: card.title,
          cardBody: '',
          cardKind: card.kind,
          authorId: admin.id,
          ...(running
            ? { phase: 'running' }
            : paused
              ? { phase: 'cancelled', pausedFor: 'budget' }
              : {
                  phase: 'finished',
                  finishedBy: 'worker',
                  summary: 'Added a Retry collect button to the card.',
                  finishedAt: now,
                  endedAt: now,
                }),
          model: card.round.model,
          effort: card.round.effort,
          startedAt,
        },
      });
    }
  }
  const failedAt = new Date(now.getTime() - 60 * 60_000);
  for (const run of DEMO_FAILED_RUNS) {
    await prisma.run.upsert({
      where: { id: run.id },
      update: {},
      create: {
        id: run.id,
        kind: run.kind,
        projectId: DEMO_PROJECT_ID,
        title: run.title,
        runtime: 'claude',
        status: 'failed',
        triggeredByType: run.trigger,
        triggeredById: run.trigger === 'user' ? admin.id : null,
        startedAt: new Date(failedAt.getTime() - 5 * 60_000),
        endedAt: failedAt,
        updatedAt: failedAt,
      },
    });
  }
  return { projectId: DEMO_PROJECT_ID, cards: DEMO_CARDS.length };
};
