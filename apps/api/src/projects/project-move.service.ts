import { randomUUID } from 'node:crypto';
import {
  ACTIVE_CARD_ROUND_PHASES,
  type ProjectMoveCheck,
  type ProjectMoveResult,
  type ProjectMoveWorktree,
} from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { RunnerPresence } from '../runners/runner-presence';
import { RunnerWatchList } from '../runners/runner-watch-list';
import type { MoveProjectDto } from './dto';
import { projectError, projectNotFound } from './project-error';
import { ProjectInspector } from './project-inspector';
import {
  detectedDocsData,
  type ProjectWithRelations,
  toProjectDetail,
} from './project-mapper';
import {
  docsSummary,
  inspectionData,
  isUniqueViolation,
  withRelations,
} from './projects.service';

type Db = Pick<Prisma.TransactionClient, 'boardCardRound' | 'run' | 'slot'>;

/**
 * A slot whose session may still run on the runner. `stale` and `ended` slots
 * have no live session left (spec 11 D8).
 */
const LIVE_SLOT_STATUSES = [
  'dispatched',
  'running',
  'idle',
  'prompt',
  'quota',
] as const;

/**
 * C-400 (ADR-0107): moves a project to another runner and its main checkout
 * there. The old machine is never touched: its worktrees are listed for the
 * admin to clean up.
 */
@Injectable()
export class ProjectMoveService {
  private readonly logger = new Logger(ProjectMoveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspector: ProjectInspector,
    private readonly presence: RunnerPresence,
    private readonly watchList: RunnerWatchList,
    private readonly audit: AuditService,
  ) {}

  /** What a move would meet right now: running work and old worktrees. */
  async check(projectId: string): Promise<ProjectMoveCheck> {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) throw projectNotFound();
    const [running, worktrees] = await Promise.all([
      runningWork(this.prisma, projectId),
      this.worktrees(projectId),
    ]);
    return { running, worktrees };
  }

  async move(
    projectId: string,
    dto: MoveProjectDto,
    ctx: AuditContext,
  ): Promise<ProjectMoveResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: withRelations,
    });
    if (!project) throw projectNotFound();
    if (dto.runnerId === project.runnerId) {
      throw projectError(
        422,
        'same_runner',
        'The project is already on this runner',
      );
    }
    const target = await this.prisma.runner.findUnique({
      where: { id: dto.runnerId },
      select: { revokedAt: true },
    });
    if (!target) throw projectError(404, 'not_found', 'Runner not found');
    if (target.revokedAt) {
      throw projectError(409, 'runner_offline', 'The runner is revoked');
    }
    await refuseRunningWork(this.prisma, projectId);

    const inspection = await this.inspector.inspect(
      dto.runnerId,
      dto.path,
      ctx,
    );
    if (!inspection.isMainCheckout) {
      throw projectError(
        409,
        'not_main_checkout',
        `Not the main checkout; move to ${inspection.root} instead`,
        { suggestedPath: inspection.root },
      );
    }
    const repo = inspection.remote.repo;
    if (inspection.remote.forge !== 'github' || repo === null) {
      throw projectError(
        422,
        'unsupported_forge',
        inspection.remote.url
          ? `origin is not on GitHub: ${inspection.remote.url}`
          : 'The repository has no origin on GitHub',
      );
    }
    if (repo.toLowerCase() !== project.repo.toLowerCase()) {
      throw projectError(
        422,
        'different_repository',
        `${inspection.root} is a checkout of ${repo}, not ${project.repo}`,
      );
    }
    const profileId = dto.defaultProfileId ?? null;
    if (profileId !== null) {
      const profile = await this.prisma.runtimeProfile.findUnique({
        where: { id: profileId },
        select: { runnerId: true },
      });
      if (profile?.runnerId !== dto.runnerId) {
        throw projectError(
          422,
          'profile_not_on_runner',
          'defaultProfileId is not a profile of the target runner',
        );
      }
    }

    const worktrees = await this.worktrees(projectId);
    const stored = project.docsSource;
    const detected = detectedDocsData(inspection.docs);
    const rebased = stored?.manual
      ? rebasedManualDocs(stored, project.rootPath, inspection.root)
      : null;
    // Detection runs again on the new machine; a manual source is kept.
    const docsData = stored?.manual
      ? rebased
        ? { docsSource: { update: rebased } }
        : {}
      : { docsSource: { upsert: { create: detected, update: detected } } };
    let updated: ProjectWithRelations;
    let plansReset = 0;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        // A round queued between the check above and this write would run
        // on the old runner and report there; refuse it here as well.
        await refuseRunningWork(tx, projectId);
        const row = await tx.project.update({
          where: { id: projectId },
          data: {
            runnerId: dto.runnerId,
            rootPath: inspection.root,
            repo,
            ...inspectionData(inspection),
            defaultProfileId: profileId,
            watchRefusal: null,
            ...docsData,
          },
          include: withRelations,
        });
        // The orchestrator's profile is a row of the old runner (by id).
        await tx.projectOrchestratorSettings.updateMany({
          where: { projectId },
          data: { profileId: null },
        });
        // The Claude sessions live on the old machine; the next round and
        // the next design turn start fresh ones on the new runner.
        await tx.boardCard.updateMany({
          where: { projectId },
          data: {
            sessionId: null,
            designSessionId: null,
            sessionModel: null,
            sessionEffort: null,
            sessionCardType: null,
            sessionPrefix: Prisma.DbNull,
            worktree: null,
          },
        });
        await tx.boardStack.updateMany({
          where: { projectId, designSessionId: { not: null } },
          data: { designSessionId: null },
        });
        plansReset = await resetPlanSessions(tx, projectId);
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw projectError(
          409,
          'already_connected',
          `This runner already has a project at ${inspection.root}`,
        );
      }
      throw error;
    }

    const from = {
      runnerId: project.runnerId,
      runnerName: project.runner.name,
      rootPath: project.rootPath,
    };
    this.logger.log(
      `project ${projectId} moved from runner ${from.runnerId} to ${dto.runnerId}`,
    );
    await this.audit.record({
      ...ctx,
      action: 'project.move',
      target: { type: 'project', id: projectId },
      projectId,
      before: {
        runnerId: from.runnerId,
        rootPath: from.rootPath,
        defaultProfileId: project.defaultProfileId,
        docs: stored ? docsSummary(stored) : null,
      },
      after: {
        runnerId: dto.runnerId,
        rootPath: updated.rootPath,
        defaultProfileId: profileId,
        docs: updated.docsSource ? docsSummary(updated.docsSource) : null,
        worktrees: worktrees.map((w) => w.path),
        plansReset,
      },
      result: 'ok',
    });
    // The old runner drops the root from its watch list, the new one adds it.
    await this.watchList.push(from.runnerId);
    await this.watchList.push(dto.runnerId);
    const pushCheck = await this.prisma.repositoryPushCheck.findUnique({
      where: {
        runnerId_rootPath: {
          runnerId: updated.runnerId,
          rootPath: updated.rootPath,
        },
      },
    });
    return {
      project: toProjectDetail(
        updated,
        this.presence.status(updated.runner),
        'admin',
        pushCheck,
      ),
      from,
      worktrees,
      plansReset,
    };
  }

  /**
   * The worktrees the project's work left on its runner's machine: open
   * cards' (a completed card's was removed when it was accepted) and live
   * fleet slots'.
   */
  private async worktrees(projectId: string): Promise<ProjectMoveWorktree[]> {
    const [cards, slots] = await Promise.all([
      this.prisma.boardCard.findMany({
        where: {
          projectId,
          worktree: { not: null },
          column: { not: 'completed' },
        },
        select: { number: true, title: true, worktree: true, branch: true },
        orderBy: { number: 'asc' },
      }),
      this.prisma.slot.findMany({
        where: { projectId, worktreeExists: true },
        select: { name: true, worktree: true, branch: true },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const seen = new Set<string>();
    const out: ProjectMoveWorktree[] = [];
    for (const card of cards) {
      if (card.worktree === null || seen.has(card.worktree)) continue;
      seen.add(card.worktree);
      out.push({
        path: card.worktree,
        source: 'card',
        label: `C-${card.number} ${card.title}`,
        branch: card.branch,
      });
    }
    for (const slot of slots) {
      if (seen.has(slot.worktree)) continue;
      seen.add(slot.worktree);
      out.push({
        path: slot.worktree,
        source: 'slot',
        label: slot.name,
        branch: slot.branch,
      });
    }
    return out;
  }
}

/** What runs for the project on its runner, one line each. */
const runningWork = async (db: Db, projectId: string): Promise<string[]> => {
  const [rounds, runs, slots] = await Promise.all([
    db.boardCardRound.findMany({
      where: {
        card: { projectId },
        phase: { in: [...ACTIVE_CARD_ROUND_PHASES] },
      },
      select: { card: { select: { number: true, title: true } } },
      orderBy: { startedAt: 'asc' },
    }),
    // Card rounds are listed above; fleet slots below.
    db.run.findMany({
      where: {
        projectId,
        status: 'running',
        kind: { notIn: ['card', 'orchestrator_slot'] },
      },
      select: { kind: true, title: true },
      orderBy: { startedAt: 'asc' },
    }),
    db.slot.findMany({
      where: { projectId, status: { in: [...LIVE_SLOT_STATUSES] } },
      select: { name: true },
      orderBy: { startedAt: 'asc' },
    }),
  ]);
  return [
    ...rounds.map(({ card }) => `C-${card.number} ${card.title}`),
    ...runs.map((run) => `${run.kind}${run.title ? `: ${run.title}` : ''}`),
    ...slots.map((slot) => `slot ${slot.name}`),
  ];
};

const refuseRunningWork = async (db: Db, projectId: string): Promise<void> => {
  const running = await runningWork(db, projectId);
  if (running.length > 0) {
    throw projectError(
      409,
      'work_running',
      `Stop what runs first: ${running.join(', ')}`,
    );
  }
};

/**
 * C-477: the plans' Claude sessions live on the old machine too. A plan's
 * session id is required, so each plan gets a new one; its turns before
 * `sessionSince` ran in the old one, and a task has nothing to fork until a
 * plan turn runs on the new runner. Returns how many plans were reset.
 */
const resetPlanSessions = async (
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<number> => {
  const plans = await tx.plan.findMany({
    where: { projectId },
    select: { id: true },
  });
  const sessionSince = new Date();
  for (const plan of plans) {
    await tx.plan.update({
      where: { id: plan.id },
      data: { sessionId: randomUUID(), sessionSince },
    });
  }
  await tx.planTask.updateMany({
    where: { plan: { projectId }, sessionId: { not: null } },
    data: { sessionId: null },
  });
  return plans.length;
};

/**
 * A manual docs source is the admin's word and stays manual. An `in_repo`
 * path under the old root moves with the root; other paths are kept, and the
 * admin resets them in Settings if the new machine has them elsewhere.
 * `null` when there is nothing to change.
 */
const rebasedManualDocs = (
  stored: { kind: string; localPath: string | null },
  oldRoot: string,
  newRoot: string,
): { localPath: string } | null => {
  const path = stored.localPath;
  if (stored.kind !== 'in_repo' || path === null) return null;
  if (path === oldRoot) return { localPath: newRoot };
  if (!path.startsWith(`${oldRoot}/`)) return null;
  return { localPath: `${newRoot}${path.slice(oldRoot.length)}` };
};
