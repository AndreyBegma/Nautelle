import {
  type NoProfileDetails,
  noProfileDetails,
  noProfileMessage,
  type ProfileCandidate,
  pickRuntimeProfile,
  type RuntimeProfilePick,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** What the rule reads of a project. */
export interface ProfileProject {
  id: string;
  runnerId: string;
  defaultProfileId: string | null;
}

/** A `runtime_profiles` row as the rule and its callers read it. */
export type ResolvedProfile = ProfileCandidate;

/** Builds a module's own `422 no_profile` failure from D2's details. */
export type NoProfileFailure = (
  details: NoProfileDetails,
  message: string,
) => Error;

const PROFILE_SELECT = {
  id: true,
  key: true,
  label: true,
  runtime: true,
  runnerId: true,
  missing: true,
} as const;

/**
 * The one runtime-profile rule of every model-running action (#272 D1): the
 * explicit key, else the orchestrator profile, else the project default —
 * the first that is set decides. A refusal is D2's `no_profile`, thrown with
 * the caller's own failure class so its module's catches keep working.
 */
@Injectable()
export class RuntimeProfileResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** D1's pick; `key` is a key the action names (plan create, plan turn). */
  async resolve(
    project: ProfileProject,
    options: { key?: string | null } = {},
  ): Promise<RuntimeProfilePick<ResolvedProfile>> {
    const { key } = options;
    if (!key) {
      const picks = await this.resolveMany([project]);
      return picks.get(project.id) as RuntimeProfilePick<ResolvedProfile>;
    }
    const explicit = await this.prisma.runtimeProfile.findUnique({
      where: { runnerId_key: { runnerId: project.runnerId, key } },
      select: PROFILE_SELECT,
    });
    return pickRuntimeProfile({
      runnerId: project.runnerId,
      explicit: { key, profile: explicit },
      orchestrator: null,
      default: null,
    });
  }

  /**
   * D1's pick of each project when the action names no key, in two queries
   * whatever the number of projects (C-470): the orchestrator settings, then
   * every profile they or the project defaults name.
   */
  async resolveMany(
    projects: readonly ProfileProject[],
  ): Promise<Map<string, RuntimeProfilePick<ResolvedProfile>>> {
    if (projects.length === 0) return new Map();
    const settings = await this.prisma.projectOrchestratorSettings.findMany({
      where: { projectId: { in: projects.map((p) => p.id) } },
      select: { projectId: true, profileId: true },
    });
    const orchestratorOf = new Map(
      settings.map((s) => [s.projectId, s.profileId]),
    );
    const ids = new Set<string>();
    for (const project of projects) {
      const orchestrator = orchestratorOf.get(project.id);
      if (orchestrator) ids.add(orchestrator);
      if (project.defaultProfileId) ids.add(project.defaultProfileId);
    }
    const rows =
      ids.size === 0
        ? []
        : await this.prisma.runtimeProfile.findMany({
            where: { id: { in: [...ids] } },
            select: PROFILE_SELECT,
          });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const profile = (id: string | null | undefined) =>
      id ? (byId.get(id) ?? null) : null;
    return new Map(
      projects.map((project) => [
        project.id,
        pickRuntimeProfile({
          runnerId: project.runnerId,
          explicit: null,
          orchestrator: profile(orchestratorOf.get(project.id)),
          default: profile(project.defaultProfileId),
        }),
      ]),
    );
  }

  /** The usable profile, or `fail(details, message)` thrown (D2). */
  async require(
    project: ProfileProject,
    options: { key?: string | null },
    fail: NoProfileFailure,
  ): Promise<ResolvedProfile> {
    const pick = await this.resolve(project, options);
    if (pick.ok) return pick.profile;
    const details: NoProfileDetails = noProfileDetails(pick) ?? {
      reason: 'none',
      source: null,
    };
    throw fail(
      details,
      noProfileMessage({ ...details, runtime: pick.profile?.runtime }),
    );
  }
}
