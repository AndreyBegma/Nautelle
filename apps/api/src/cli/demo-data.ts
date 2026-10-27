import {
  type CardNeedsPersonReason,
  captureFingerprint,
} from '@nautelle/shared';
import type { BoardColumn, CardEffort, PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { generateToken } from '../auth/tokens';
import { writeStarterLabels } from '../board/starter-labels';

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
  /** C-390: an open PR on `branch`, so the card waits in the Inbox to merge. */
  openPr?: { number: number; branch: string };
  /** C-390: the card needs a person, so the Inbox lists it with Retry. */
  needsPerson?: CardNeedsPersonReason;
  /** C-394: a design drawn and waiting for approval, with one frame. */
  design?: true;
  /**
   * C-443: tracked from a person's own terminal session, whose token-saver
   * rows (`DEMO_TERMINAL_FILTERS`) are the card's saving.
   */
  terminal?: true;
  /** C-417: the card runs after these cards, by number. */
  dependsOn?: readonly number[];
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
    title: 'Gift cards in the cart',
    column: 'finished',
    kind: 'feature',
    openPr: { number: 43, branch: 'card/c7-gift-cards' },
  },
  {
    title: 'Order history pages past 100 orders',
    column: 'finished',
    kind: 'bug',
    openPr: { number: 44, branch: 'card/c8-order-history' },
    needsPerson: 'ci_still_failing',
  },
  {
    title: 'Import products from a CSV file',
    column: 'in_progress',
    kind: 'feature',
    round: { model: 'claude-sonnet-5-5', effort: 'medium', paused: true },
  },
  {
    title: 'Redesign the order summary',
    column: 'todo',
    kind: 'feature',
    design: true,
  },
  {
    // C-417: both dependencies are Finished with an open PR, so Run is
    // blocked until one of them is merged.
    title: 'Gift cards on the order history page',
    column: 'todo',
    kind: 'feature',
    dependsOn: [7, 8],
  },
  {
    title: 'Tune the retry backoff',
    column: 'in_progress',
    kind: 'feature',
    terminal: true,
  },
];

/** C-443: the manual Claude session the terminal card of the demo Board tracks. */
export const DEMO_TERMINAL_SESSION_ID = 'demo-session-terminal';

/** C-443: what that session's filtered commands kept, by filter (bytes). */
export const DEMO_TERMINAL_FILTERS: ReadonlyArray<{
  filter: string;
  commands: number;
  rawBytes: number;
  keptBytes: number;
}> = [
  { filter: 'js/jest', commands: 3, rawBytes: 48_000, keptBytes: 4_800 },
  { filter: 'ops/git', commands: 4, rawBytes: 20_000, keptBytes: 6_000 },
  { filter: 'js/tsc', commands: 2, rawBytes: 9_000, keptBytes: 3_000 },
];

const DEMO_DESIGN_FRAME_HTML =
  '<!doctype html><html><body style="margin:0;font-family:sans-serif;background:#f4f4f5">' +
  '<header style="padding:16px 24px;background:#18181b;color:#fff"><b>Order summary</b></header>' +
  '<main style="padding:24px"><div style="background:#fff;border-radius:12px;padding:16px">' +
  '<p>2 items</p><p><b>Total: $48.00</b></p></div></main></body></html>';

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

/** C-401: the away session that asks for the tool calls below. */
export const DEMO_AWAY_SESSION_ID = 'demo-session-away';

/**
 * C-401: tool calls the away session waits on, the soonest to expire first.
 * The test run comes with Claude Code's rule suggestion, so it can be
 * allowed for similar calls; reading the project's `.env` always asks.
 */
export const DEMO_TOOL_CALLS: ReadonlyArray<{
  id: string;
  toolName: string;
  input: Record<string, string>;
  suggestions?: ReadonlyArray<{ toolName: string; ruleContent: string }>;
  expiresInMinutes: number;
}> = [
  {
    id: 'demo-action-test',
    toolName: 'Bash',
    input: { command: 'bun run test --filter web' },
    suggestions: [{ toolName: 'Bash', ruleContent: 'bun run test:*' }],
    expiresInMinutes: 235,
  },
  {
    id: 'demo-action-env',
    toolName: 'Read',
    input: { file_path: '/srv/demo/acme-shop/.env' },
    expiresInMinutes: 240,
  },
];

/**
 * C-416: a session asks to accept the card with PR #43 and merge it, pinned
 * to the head it had then; an earlier request for it failed because the PR
 * moved before it was approved.
 */
export const DEMO_CARD_ACCEPTS: ReadonlyArray<{
  id: string;
  /** Its head when the request was filed; the failed one's is older. */
  headSha: string;
  /** The approval found the PR at this head instead and merged nothing. */
  movedTo?: string;
  minutesAgo: number;
}> = [
  {
    id: 'demo-action-accept',
    headSha: '4f2c9e1b7a3d5e8f0c6b2a9d1e4f7c3b5a8d0e2f',
    minutesAgo: 2,
  },
  {
    id: 'demo-action-accept-moved',
    headSha: '9a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6b',
    movedTo: '4f2c9e1b7a3d5e8f0c6b2a9d1e4f7c3b5a8d0e2f',
    minutesAgo: 25,
  },
];

/**
 * C-402: an active operator besides the admin, so Admin › Users has someone
 * to give a reset link. Their password is random and never shown: they can
 * get in only through such a link.
 */
export const DEMO_TEAMMATE = {
  id: 'demo-user-teammate',
  email: 'sam@acme.example',
  name: 'Sam Rivera',
} as const;

/**
 * C-483: enough further accounts that Admin › Users has a second page: active
 * ones, a few registrations waiting for approval and one disabled account.
 */
export const DEMO_EXTRA_USERS: ReadonlyArray<{
  id: string;
  email: string;
  name: string;
  status: 'active' | 'pending' | 'disabled';
}> = [
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `demo-user-member-${String(i + 1).padStart(2, '0')}`,
    email: `member${String(i + 1).padStart(2, '0')}@acme.example`,
    name: `Member ${String(i + 1).padStart(2, '0')}`,
    status: 'active' as const,
  })),
  ...[1, 2, 3].map((n) => ({
    id: `demo-user-waiting-${n}`,
    email: `waiting${n}@acme.example`,
    name: `Waiting ${n}`,
    status: 'pending' as const,
  })),
  {
    id: 'demo-user-gone',
    email: 'gone@acme.example',
    name: 'Gone Fishing',
    status: 'disabled',
  },
];

/**
 * C-443: the terminal card's session and its token-saver rows, each stored the
 * way the runner reports a manual session's filtered commands.
 */
const seedTerminalSession = async (
  prisma: Pick<PrismaClient, 'agentSession' | 'tokenSaverStat'>,
  ownerId: string,
  now: Date,
): Promise<void> => {
  await prisma.agentSession.upsert({
    where: { id: DEMO_TERMINAL_SESSION_ID },
    update: {},
    create: {
      id: DEMO_TERMINAL_SESSION_ID,
      runnerId: DEMO_RUNNER_ID,
      runtime: 'claude',
      externalId: '0000c443-0000-4000-8000-000000000001',
      projectId: DEMO_PROJECT_ID,
      cwd: '/srv/demo/acme-shop',
      gitBranch: 'tune-retry-backoff',
      title: 'Tune the retry backoff',
      origin: 'manual',
      ownerId,
      startedAt: new Date(now.getTime() - 45 * 60_000),
      lastEventAt: now,
    },
  });
  for (const stat of DEMO_TERMINAL_FILTERS) {
    for (let command = 1; command <= stat.commands; command += 1) {
      const id = `demo-stat-terminal-${stat.filter.replace('/', '-')}-${command}`;
      await prisma.tokenSaverStat.upsert({
        where: { id },
        update: {},
        create: {
          id,
          projectId: DEMO_PROJECT_ID,
          runKind: 'manual',
          filter: stat.filter,
          rawBytes: Math.round(stat.rawBytes / stat.commands),
          keptBytes: Math.round(stat.keptBytes / stat.commands),
          bypassed: false,
          passedThrough: false,
          createdAt: new Date(now.getTime() - (30 - command) * 60_000),
          sessionId: DEMO_TERMINAL_SESSION_ID,
          sessionExternalId: '0000c443-0000-4000-8000-000000000001',
        },
      });
    }
  }
};

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
    | 'boardCardDependency'
    | 'run'
    | 'boardCardRound'
    | 'agentSession'
    | 'tokenSaverStat'
    | 'actionRequest'
    | 'toolUseRule'
    | 'boardRunQueueCard'
    | 'taskDesign'
    | 'planTurn'
    | 'designRevision'
    | 'designFrame'
    | 'projectLabel'
    | 'projectLabelPathRule'
  >,
  adminEmail: string,
): Promise<{ projectId: string; cards: number }> => {
  const email = adminEmail.trim().toLowerCase();
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) throw new DemoDataError(`No user with email ${email}`);

  const now = new Date();
  await prisma.user.upsert({
    where: { id: DEMO_TEAMMATE.id },
    update: {},
    create: {
      ...DEMO_TEAMMATE,
      passwordHash: await hashPassword(generateToken()),
      role: 'operator',
      status: 'active',
      approvedById: admin.id,
      approvedAt: now,
    },
  });
  const extraHash = await hashPassword(generateToken());
  await prisma.user.createMany({
    data: DEMO_EXTRA_USERS.map((user, i) => ({
      ...user,
      passwordHash: extraHash,
      role: 'viewer' as const,
      // Older than the teammate, so Sam stays on the first page (newest first).
      createdAt: new Date(now.getTime() - (DEMO_EXTRA_USERS.length - i) * 1000),
      ...(user.status === 'pending'
        ? {}
        : { approvedById: admin.id, approvedAt: now }),
    })),
    skipDuplicates: true,
  });
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
      // C-401: away mode requests wait four hours for a person.
      toolUseTimeoutMinutes: 240,
      createdById: admin.id,
      members: { create: { userId: admin.id, addedById: admin.id } },
    },
  });
  // C-497: the starter labels, as a connected project gets them.
  if (
    (await prisma.projectLabel.count({
      where: { projectId: DEMO_PROJECT_ID },
    })) === 0
  ) {
    await writeStarterLabels(prisma, DEMO_PROJECT_ID);
  }
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

  const cardIds = new Map<number, string>();
  for (const [index, card] of DEMO_CARDS.entries()) {
    const number = index + 1;
    if (card.terminal) {
      await seedTerminalSession(prisma, admin.id, now);
    }
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
        ...(card.terminal
          ? {
              source: 'terminal' as const,
              trackedSessionId: DEMO_TERMINAL_SESSION_ID,
            }
          : {}),
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
        ...(card.openPr === undefined
          ? {}
          : {
              branch: card.openPr.branch,
              prNumber: card.openPr.number,
              prUrl: `https://github.com/acme/shop/pull/${card.openPr.number}`,
              prState: 'open' as const,
            }),
        ...(card.needsPerson === undefined
          ? {}
          : { needsPerson: true, needsPersonReason: card.needsPerson }),
      },
    });
    cardIds.set(number, created.id);
    if (card.design) {
      const runId = `demo-run-design-${number}`;
      const drawnAt = new Date(now.getTime() - 10 * 60_000);
      await prisma.run.upsert({
        where: { id: runId },
        update: {},
        create: {
          id: runId,
          kind: 'plan',
          projectId: DEMO_PROJECT_ID,
          title: `C-${number} design`,
          runtime: 'claude',
          status: 'succeeded',
          triggeredByType: 'user',
          triggeredById: admin.id,
          startedAt: new Date(drawnAt.getTime() - 3 * 60_000),
          endedAt: drawnAt,
          updatedAt: drawnAt,
        },
      });
      const design = await prisma.taskDesign.upsert({
        where: { cardId: created.id },
        update: {},
        create: {
          cardId: created.id,
          needed: true,
          status: 'reviewing',
        },
      });
      const turn = await prisma.planTurn.upsert({
        where: { runId },
        update: {},
        create: {
          cardId: created.id,
          runId,
          action: 'design',
          authorId: admin.id,
          input: {},
          phase: 'succeeded',
          finishedAt: drawnAt,
        },
      });
      const revision = await prisma.designRevision.upsert({
        where: {
          designId_variant_revision: {
            designId: design.id,
            variant: 1,
            revision: 1,
          },
        },
        update: {},
        create: {
          designId: design.id,
          variant: 1,
          revision: 1,
          title: 'Order summary',
          rationale: 'A compact card with the total on its own line.',
          turnId: turn.id,
        },
      });
      await prisma.designFrame.upsert({
        where: {
          revisionId_position: { revisionId: revision.id, position: 0 },
        },
        update: {},
        create: {
          revisionId: revision.id,
          position: 0,
          name: 'Screen',
          slug: 'screen',
          html: DEMO_DESIGN_FRAME_HTML,
          kind: 'screen',
        },
      });
    }
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

  // C-401: an unattended session waiting on two tool calls, and a project
  // rule an earlier "Always allow" stored.
  await prisma.agentSession.upsert({
    where: { id: DEMO_AWAY_SESSION_ID },
    update: {},
    create: {
      id: DEMO_AWAY_SESSION_ID,
      runnerId: DEMO_RUNNER_ID,
      runtime: 'claude',
      externalId: '0000c401-0000-4000-8000-000000000001',
      projectId: DEMO_PROJECT_ID,
      cwd: '/srv/demo/acme-shop',
      gitBranch: 'card/c4-show-the-runner-version-in-the-header',
      title: 'Show the runner version in the header',
      origin: 'manual',
      ownerId: admin.id,
      startedAt: new Date(now.getTime() - 30 * 60_000),
      lastEventAt: now,
    },
  });
  for (const call of DEMO_TOOL_CALLS) {
    const input = JSON.stringify(call.input);
    await prisma.actionRequest.upsert({
      where: { id: call.id },
      update: {},
      create: {
        id: call.id,
        projectId: DEMO_PROJECT_ID,
        runnerId: DEMO_RUNNER_ID,
        sessionId: DEMO_AWAY_SESSION_ID,
        requestedById: admin.id,
        kind: 'tool_use',
        summary: `Allow ${call.toolName} in an unattended Claude Code session`,
        args: {
          toolName: call.toolName,
          input,
          truncated: false,
          fullLength: input.length,
          ...(call.suggestions ? { suggestions: [...call.suggestions] } : {}),
        },
        expiresAt: new Date(now.getTime() + call.expiresInMinutes * 60_000),
      },
    });
  }
  // C-416: the card with PR #43, accepted and merged at a pinned head.
  const accepted = DEMO_CARDS.findIndex((card) => card.openPr?.number === 43);
  const acceptCard = DEMO_CARDS[accepted];
  for (const request of DEMO_CARD_ACCEPTS) {
    const at = new Date(now.getTime() - request.minutesAgo * 60_000);
    await prisma.actionRequest.upsert({
      where: { id: request.id },
      update: {},
      create: {
        id: request.id,
        projectId: DEMO_PROJECT_ID,
        runnerId: DEMO_RUNNER_ID,
        sessionId: DEMO_AWAY_SESSION_ID,
        requestedById: admin.id,
        kind: 'card_accept',
        summary: `C-${accepted + 1} is green and reviewed; accept it and merge the pull request.`,
        args: {
          card: accepted + 1,
          merge: true,
          title: acceptCard.title,
          prNumber: 43,
          prUrl: 'https://github.com/acme/shop/pull/43',
          headSha: request.headSha,
        },
        createdAt: at,
        expiresAt: new Date(at.getTime() + 24 * 60 * 60_000),
        ...(request.movedTo
          ? {
              status: 'failed' as const,
              decidedById: admin.id,
              decidedAt: new Date(at.getTime() + 5 * 60_000),
              result: {
                error: 'head_moved',
                message: `The head of #43 moved to ${request.movedTo.slice(0, 7)} after the request; nothing was merged — ask again`,
                headSha: request.movedTo,
              },
            }
          : {}),
      },
    });
  }
  await prisma.toolUseRule.upsert({
    where: { id: 'demo-rule-lint' },
    update: {},
    create: {
      id: 'demo-rule-lint',
      projectId: DEMO_PROJECT_ID,
      scope: 'project',
      toolName: 'Bash',
      ruleContent: 'bun run lint:*',
      createdById: admin.id,
      useCount: 3,
      lastUsedAt: new Date(now.getTime() - 15 * 60_000),
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60_000),
    },
  });
  for (const [index, card] of DEMO_CARDS.entries()) {
    for (const dependsOn of card.dependsOn ?? []) {
      const cardId = cardIds.get(index + 1);
      const dependsOnId = cardIds.get(dependsOn);
      if (!cardId || !dependsOnId) continue;
      await prisma.boardCardDependency.upsert({
        where: { cardId_dependsOnId: { cardId, dependsOnId } },
        update: {},
        create: { cardId, dependsOnId },
      });
    }
  }
  return { projectId: DEMO_PROJECT_ID, cards: DEMO_CARDS.length };
};
