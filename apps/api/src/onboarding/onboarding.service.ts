import {
  type MyOnboardingFacts,
  type OnboardingCardStage,
  type OnboardingFacts,
  profileAgentdockOf,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-request';
import { PrismaService } from '../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';

/**
 * C-396: the facts behind Getting started. Read from rows other features
 * keep — nothing here is written for the checklist except the push check,
 * which `ProjectsService.pushCheck` stores.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  /** C-476: the caller's own steps — nothing about anyone else. */
  async mine(
    user: Pick<AuthUser, 'id' | 'role' | 'projectScope'>,
  ): Promise<MyOnboardingFacts> {
    const [notifications, rounds, projectCount] = await Promise.all([
      this.notificationsOn(user.id),
      this.prisma.boardCardRound.count({ where: { authorId: user.id } }),
      this.prisma.project.count({ where: this.access.visibleWhere(user) }),
    ]);
    return { notifications, cardRun: rounds > 0, projectCount };
  }

  /** C-476: `userId` linked Telegram or turned on email for a kind. */
  private async notificationsOn(userId: string): Promise<boolean> {
    const [telegram, email] = await Promise.all([
      this.prisma.telegramLink.count({ where: { userId } }),
      this.prisma.notificationRule.count({
        where: { userId, email: { in: ['immediate', 'digest'] } },
      }),
    ]);
    return telegram > 0 || email > 0;
  }

  /** `adminId`: the caller, whose own notifications count. */
  async facts(adminId: string): Promise<OnboardingFacts> {
    const [
      projects,
      runners,
      firstCard,
      app,
      installations,
      users,
      providers,
      notifications,
      slack,
    ] = await Promise.all([
      this.prisma.project.findMany({
        select: {
          id: true,
          runnerId: true,
          rootPath: true,
          defaultProfileId: true,
          orchestratorSettings: { select: { profileId: true } },
        },
      }),
      this.prisma.runner.findMany({
        where: { revokedAt: null },
        select: { capabilities: true },
      }),
      this.firstCard(),
      this.prisma.gitHubApp.count(),
      this.prisma.gitHubInstallation.count({ where: { suspended: false } }),
      this.prisma.user.count(),
      this.prisma.llmProviderSetting.count({
        where: { keyCiphertext: { not: null }, capUsd: { gt: 0 } },
      }),
      this.notificationsOn(adminId),
      this.prisma.slackWebhook.count(),
    ]);

    return {
      profile: projects.some(
        (p) =>
          p.defaultProfileId !== null ||
          (p.orchestratorSettings?.profileId ?? null) !== null,
      ),
      plugin: runners.some((r) =>
        Object.values(profileAgentdockOf(r.capabilities)).some(
          (report) => report.plugin !== null,
        ),
      ),
      pushCheck: await this.pushCheck(projects),
      firstCard,
      githubApp: app > 0 && installations > 0,
      teammates: users > 1,
      aiProvider: providers > 0,
      notifications: notifications || slack > 0,
    };
  }

  /** A passing check of a connected checkout when there is one, else the latest. */
  private async pushCheck(
    projects: readonly { id: string; runnerId: string; rootPath: string }[],
  ): Promise<OnboardingFacts['pushCheck']> {
    if (projects.length === 0) return null;
    const checks = await this.prisma.repositoryPushCheck.findMany({
      where: {
        OR: projects.map((p) => ({
          runnerId: p.runnerId,
          rootPath: p.rootPath,
        })),
      },
      orderBy: [{ ok: 'desc' }, { checkedAt: 'desc' }],
      take: 1,
    });
    const check = checks[0];
    const project = check
      ? projects.find(
          (p) => p.runnerId === check.runnerId && p.rootPath === check.rootPath,
        )
      : undefined;
    if (!check || !project) return null;
    return {
      projectId: project.id,
      ok: check.ok,
      remote: check.remote,
      message: check.message,
      checkedAt: check.checkedAt.toISOString(),
    };
  }

  private async firstCard(): Promise<OnboardingCardStage> {
    const merged = await this.prisma.boardCard.count({
      where: { OR: [{ mergedAt: { not: null } }, { prState: 'merged' }] },
    });
    if (merged > 0) return 'merged';
    const withPr = await this.prisma.boardCard.count({
      where: { prNumber: { not: null } },
    });
    return withPr > 0 ? 'pr' : 'none';
  }
}
