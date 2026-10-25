import {
  attachmentContentPath,
  type DesignRevisionView,
  effectiveProjectRole,
  INBOX_ITEM_KINDS,
  type InboxItemView,
  type InboxMergeItem,
  type InboxMissingProject,
  type InboxView,
  inboxCardItems,
  inboxCounts,
  mayDecideActionRequest,
  projectRoleAtLeast,
  sortInboxItems,
} from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../auth';
import { BoardService } from '../board/board.service';
import { cardFaceArgs } from '../board/board-mapper';
import { PrismaService } from '../database/prisma.service';
import { revisionSelect, toRevisionView } from '../design/design-mapper';
import { toActionRequestSummary } from '../local/action-request-mapper';
import { ProjectAccessService } from '../projects';
import { ReadinessService } from '../readiness';

/** The columns where a card can still wait on a person. */
const OPEN_COLUMNS = ['todo', 'in_progress', 'finished'] as const;

/** At most this many pending requests a read lists per project. */
const REQUESTS_PER_PROJECT = 50;

interface InboxProject {
  id: string;
  name: string;
  createdAt: Date;
  runnerLastSeenAt: Date | null;
}

/**
 * `GET /inbox` (C-390, ADR-0106): everything that waits for a decision of
 * the caller, across every project where they are operator or higher. One
 * read model, so the page, the rail badge and Overview's preview count the
 * same items; the rules of which card raises what are the shared
 * `inboxCardItems`. It writes nothing — every action goes to the route that
 * already owns it.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly board: BoardService,
    private readonly readiness: ReadinessService,
  ) {}

  async view(user: AuthUser): Promise<InboxView> {
    const projects = await this.projects(user);
    if (projects.length === 0) {
      return {
        items: [],
        counts: inboxCounts([]),
        total: 0,
        projects: [],
        missing: [],
      };
    }
    const [cards, permissions, setup] = await Promise.all([
      this.cardItems(projects),
      this.permissionItems(user, projects),
      this.setupItems(projects),
    ]);
    const items = sortInboxItems([...cards, ...permissions, ...setup.items]);
    const counts = inboxCounts(items);
    return {
      items,
      counts,
      total: INBOX_ITEM_KINDS.reduce((sum, kind) => sum + counts[kind], 0),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      missing: setup.missing,
    };
  }

  /** The projects the caller operates, by name. */
  private async projects(user: AuthUser): Promise<InboxProject[]> {
    const rows = await this.prisma.project.findMany({
      where: this.access.visibleWhere(user),
      select: {
        id: true,
        displayName: true,
        createdAt: true,
        runner: { select: { lastSeenAt: true } },
        members: {
          where: { userId: user.id },
          select: { roleOverride: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });
    return rows
      .filter(
        (p) =>
          user.role === 'admin' ||
          projectRoleAtLeast(
            effectiveProjectRole(user.role, p.members[0]?.roleOverride ?? null),
            'operator',
          ),
      )
      .map((p) => ({
        id: p.id,
        name: p.displayName,
        createdAt: p.createdAt,
        runnerLastSeenAt: p.runner.lastSeenAt,
      }));
  }

  /**
   * The cards that may raise an item — a narrow superset of the shared
   * rules, which then decide. A `fleet` card raises none.
   */
  private async cardItems(projects: InboxProject[]): Promise<InboxItemView[]> {
    const rows = await this.prisma.boardCard.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        column: { in: [...OPEN_COLUMNS] },
        source: { not: 'fleet' },
        OR: [
          { column: 'in_progress' },
          { needsPerson: true },
          { collectState: 'failed' },
          { autoRunError: { not: null } },
          { design: { is: { needed: true, status: 'reviewing' } } },
          { column: 'finished', prState: 'open' },
        ],
      },
      ...cardFaceArgs,
      orderBy: [{ projectId: 'asc' }, { number: 'asc' }],
    });
    if (rows.length === 0) return [];
    const designIds = rows
      .filter((c) => c.design?.needed && c.design.status === 'reviewing')
      .map((c) => c.id);
    const finishedIds = rows
      .filter((c) => c.column === 'finished')
      .map((c) => c.id);
    const [views, revisions, demos] = await Promise.all([
      this.board.cardViews(rows),
      this.revisionsOf(designIds),
      this.demosOf(finishedIds),
    ]);
    const names = new Map(projects.map((p) => [p.id, p.name]));
    return rows.flatMap((row, i) =>
      inboxCardItems(views[i], {
        projectId: row.projectId,
        projectName: names.get(row.projectId) ?? '',
        branch: row.branch,
        revisions: revisions.get(row.id) ?? [],
        demo: demos.get(row.id) ?? null,
      }),
    );
  }

  /** Of each card's design, the newest revision of each variant not archived. */
  private async revisionsOf(
    cardIds: string[],
  ): Promise<Map<string, DesignRevisionView[]>> {
    if (cardIds.length === 0) return new Map();
    const rows = await this.prisma.designRevision.findMany({
      where: { archived: false, design: { cardId: { in: cardIds } } },
      select: { ...revisionSelect, design: { select: { cardId: true } } },
      orderBy: [{ variant: 'asc' }, { revision: 'desc' }],
    });
    const byCard = new Map<string, DesignRevisionView[]>();
    for (const row of rows) {
      const cardId = row.design.cardId;
      if (!cardId) continue;
      const list = byCard.get(cardId) ?? [];
      if (list.some((r) => r.variant === row.variant)) continue;
      list.push(toRevisionView(row));
      byCard.set(cardId, list);
    }
    return byCard;
  }

  /** Each card's newest demo, with its video's URL once it is ready. */
  private async demosOf(
    cardIds: string[],
  ): Promise<Map<string, NonNullable<InboxMergeItem['demo']>>> {
    if (cardIds.length === 0) return new Map();
    const rows = await this.prisma.cardDemo.findMany({
      where: { cardId: { in: cardIds } },
      select: {
        cardId: true,
        status: true,
        attachmentId: true,
        durationMs: true,
        card: { select: { projectId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const byCard = new Map<string, NonNullable<InboxMergeItem['demo']>>();
    for (const row of rows) {
      if (byCard.has(row.cardId)) continue;
      byCard.set(row.cardId, {
        status: row.status,
        contentUrl:
          row.status === 'ready' && row.attachmentId
            ? attachmentContentPath(row.card.projectId, row.attachmentId)
            : null,
        durationMs: row.durationMs,
      });
    }
    return byCard;
  }

  /** The pending, unexpired requests the caller may decide (D18). */
  private async permissionItems(
    user: AuthUser,
    projects: InboxProject[],
  ): Promise<InboxItemView[]> {
    const rows = await this.prisma.actionRequest.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: REQUESTS_PER_PROJECT * projects.length,
    });
    const names = new Map(projects.map((p) => [p.id, p.name]));
    return rows
      .filter((row) =>
        mayDecideActionRequest({
          kind: row.kind,
          requestedById: row.requestedById,
          userId: user.id,
          isAdmin: user.role === 'admin',
        }),
      )
      .map((row) => ({
        id: `permission:${row.id}`,
        kind: 'permission' as const,
        projectId: row.projectId,
        projectName: names.get(row.projectId) ?? '',
        since: row.createdAt.toISOString(),
        request: toActionRequestSummary(row),
      }));
  }

  /**
   * The Run blockers of each project with an open card (#272 D3): a project
   * nobody works in waits on nobody. A project whose readiness cannot be
   * read is `missing`; the rest of the list still loads.
   */
  private async setupItems(
    projects: InboxProject[],
  ): Promise<{ items: InboxItemView[]; missing: InboxMissingProject[] }> {
    const busy = await this.prisma.boardCard.groupBy({
      by: ['projectId'],
      where: {
        projectId: { in: projects.map((p) => p.id) },
        column: { in: [...OPEN_COLUMNS] },
        source: { not: 'fleet' },
      },
    });
    const ids = new Set(busy.map((b) => b.projectId));
    const busyProjects = projects.filter((p) => ids.has(p.id));
    const read = await Promise.allSettled(
      busyProjects.map((project) => this.readiness.view(project.id)),
    );
    const items: InboxItemView[] = [];
    const missing: InboxMissingProject[] = [];
    read.forEach((result, i) => {
      const project = busyProjects[i];
      if (result.status === 'rejected') {
        this.logger.warn(
          `Inbox: readiness of ${project.id} failed: ${String(result.reason)}`,
        );
        missing.push({
          projectId: project.id,
          projectName: project.name,
          message: 'Its setup could not be read.',
        });
        return;
      }
      for (const blocker of result.value.actions.run) {
        const since =
          blocker.code === 'runner_offline'
            ? (project.runnerLastSeenAt ?? project.createdAt)
            : project.createdAt;
        items.push({
          id: `setup:${project.id}:${blocker.code}`,
          kind: 'setup',
          projectId: project.id,
          projectName: project.name,
          since: since.toISOString(),
          blocker,
        });
      }
    });
    return { items, missing };
  }
}
