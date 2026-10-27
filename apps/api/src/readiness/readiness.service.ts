import {
  DOCS_SPEC_COMMAND,
  type ProjectReadinessView,
  projectReadiness,
  READINESS_ACTION_COMMANDS,
  suggestRuntimeProfile,
} from '@nautelle/shared';
import type { CommandName } from '@nautelle/shared/protocol';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveSpecTarget } from '../planner/spec-target';
import { projectNotFound } from '../projects';
import { RunnerPresence } from '../runners/runner-presence';
import { RuntimeProfileResolver } from './runtime-profile.resolver';

/** Every command an action of D3 needs, once — and #379's docs-repo write. */
const ACTION_COMMANDS: readonly CommandName[] = [
  ...new Set<CommandName>([
    ...Object.values(READINESS_ACTION_COMMANDS).flat(),
    DOCS_SPEC_COMMAND,
  ]),
];

/**
 * Project readiness (#272 D3, D4): the facts from database rows and runner
 * presence — never the project filesystem (ADR-0001) — run through the pure
 * `projectReadiness`.
 */
@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RunnerPresence,
    private readonly resolver: RuntimeProfileResolver,
  ) {}

  async view(projectId: string): Promise<ProjectReadinessView> {
    const view = (await this.viewMany([projectId])).get(projectId);
    if (view instanceof Error) throw view;
    if (!view) throw projectNotFound();
    return view;
  }

  /**
   * The readiness of every project, in a fixed number of queries whatever
   * their number (C-470): the Inbox reads each busy project on every load.
   * A project that is gone or cannot be read is its own `Error`; the others
   * still answer.
   */
  async viewMany(
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectReadinessView | Error>> {
    const ids = [...new Set(projectIds)];
    if (ids.length === 0) return new Map();
    const projects = await this.prisma.project.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        runnerId: true,
        defaultProfileId: true,
        rootPath: true,
        codeSentinelConfig: true,
        shipSessionContent: true,
        docsSource: {
          select: { kind: true, localPath: true, repo: true, specDir: true },
        },
      },
    });
    const [picks, profiles] = await Promise.all([
      this.resolver.resolveMany(projects),
      this.prisma.runtimeProfile.findMany({
        where: {
          runnerId: { in: [...new Set(projects.map((p) => p.runnerId))] },
        },
        select: {
          id: true,
          key: true,
          label: true,
          runtime: true,
          runnerId: true,
          missing: true,
        },
      }),
    ]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const views = new Map<string, ProjectReadinessView | Error>();
    for (const id of ids) {
      const project = byId.get(id);
      const pick = picks.get(id);
      if (!project || !pick) {
        views.set(id, projectNotFound());
        continue;
      }
      try {
        const runnerConnected = this.presence.isConnected(project.runnerId);
        const missingCommands = runnerConnected
          ? ACTION_COMMANDS.filter(
              (name) =>
                this.presence.commandSupport(project.runnerId, name) ===
                'missing',
            )
          : [];
        const suggestion = suggestRuntimeProfile(
          profiles.filter((p) => p.runnerId === project.runnerId),
          project.runnerId,
        );
        const chosen = pick.profile;
        views.set(id, {
          profile:
            chosen && pick.source
              ? { key: chosen.key, label: chosen.label, source: pick.source }
              : null,
          suggestion: suggestion
            ? {
                id: suggestion.id,
                key: suggestion.key,
                label: suggestion.label,
              }
            : null,
          actions: projectReadiness({
            profile: pick,
            runnerConnected,
            missingCommands,
            specTarget: resolveSpecTarget(project).kind,
            shipSessionContent: project.shipSessionContent,
          }),
        });
      } catch (error) {
        views.set(
          id,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    return views;
  }
}
