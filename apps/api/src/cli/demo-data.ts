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

/** The cards of the demo Board: a few in each working column. */
export const DEMO_CARDS: ReadonlyArray<{
  title: string;
  column: BoardColumn;
  kind: 'feature' | 'bug';
  /**
   * C-359: a round 1 launched with this model and effort. It finished, or
   * (C-399) a hard budget paused it.
   */
  round?: { model: string; effort: CardEffort; paused?: true };
}> = [
  { title: 'Export the activity feed as CSV', column: 'todo', kind: 'feature' },
  { title: 'Dark mode for the settings page', column: 'todo', kind: 'feature' },
  {
    title: 'Board search misses cards with emoji',
    column: 'todo',
    kind: 'bug',
  },
  {
    title: 'Show the runner version in the header',
    column: 'in_progress',
    kind: 'feature',
  },
  {
    title: 'Retry a failed collect from the card',
    column: 'finished',
    kind: 'feature',
    round: { model: 'claude-opus-5-5', effort: 'high' },
  },
  {
    title: 'Import products from a CSV file',
    column: 'in_progress',
    kind: 'feature',
    round: { model: 'claude-sonnet-5-5', effort: 'medium', paused: true },
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
    'user' | 'runner' | 'project' | 'boardCard' | 'run' | 'boardCardRound'
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
      lastInspectedAt: now,
      createdById: admin.id,
      members: { create: { userId: admin.id, addedById: admin.id } },
    },
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
              sessionId: '0000c399-0000-4000-8000-000000000006',
            }
          : {}),
      },
    });
    if (card.round) {
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
          status: paused ? 'abandoned' : 'succeeded',
          ...(paused ? { outcome: 'Paused: a hard budget was reached' } : {}),
          triggeredByType: 'user',
          triggeredById: admin.id,
          startedAt,
          endedAt: now,
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
          ...(paused
            ? { phase: 'cancelled', pausedFor: 'budget' }
            : {
                phase: 'finished',
                finishedBy: 'worker',
                summary: 'Added a Retry collect button to the card.',
                endedAt: now,
              }),
          model: card.round.model,
          effort: card.round.effort,
          startedAt,
          finishedAt: now,
        },
      });
    }
  }
  return { projectId: DEMO_PROJECT_ID, cards: DEMO_CARDS.length };
};
