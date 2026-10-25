import { z } from 'zod';
import { TEXT_MESSAGE_MAX, TEXT_NAME_MAX, TEXT_PATH_MAX } from '../bounded';
import type { CommandDefinition } from '../commands';
import { absolutePathSchema } from '../projects';

/**
 * C-396 (ADR-0101): what the connect dialog needs from a runner before a
 * project is stored. The control plane never reads a project's filesystem
 * (ADR-0001), so the runner lists the git repositories under its own
 * `allowedRoots` for a picker, and checks that it can push to a repository's
 * origin. Nothing is stored by either command.
 */

/** A bounded walk of local folders; no git, no network. */
export const PROJECT_DISCOVER_TIMEOUT_MS = 15_000;
/** Folders below an allowed root that the walk opens: `~/dev/team/app` is depth 2. */
export const DISCOVER_DEPTH_MAX = 3;
/** The walk stops after this many repositories, and after this many folders. */
export const DISCOVER_REPOSITORIES_MAX = 200;
export const DISCOVER_DIRECTORIES_MAX = 5_000;

/** `project.discover`: no arguments; the roots are the runner's own policy. */
export const projectDiscoverArgsSchema = z.strictObject({});
export type ProjectDiscoverArgs = z.infer<typeof projectDiscoverArgsSchema>;

export const discoveredRepositorySchema = z.object({
  /** The main checkout's real path; what `project.inspect` takes. */
  path: absolutePathSchema,
  /** The folder's name. */
  name: z.string().min(1).max(TEXT_NAME_MAX),
  /** `owner/name` when origin is on GitHub, else null. */
  repo: z.string().max(TEXT_NAME_MAX).nullable(),
  /** The allowed root it was found under. */
  root: absolutePathSchema,
});
export type DiscoveredRepository = z.infer<typeof discoveredRepositorySchema>;

export const projectDiscoverResultSchema = z.object({
  /** The allowed roots walked; empty when the policy allows none. */
  roots: z.array(z.string().min(1).max(TEXT_PATH_MAX)),
  /** Sorted by path. */
  repositories: z
    .array(discoveredRepositorySchema)
    .max(DISCOVER_REPOSITORIES_MAX),
  /** The walk hit a limit, so some repositories may be missing. */
  truncated: z.boolean(),
});
export type ProjectDiscoverResult = z.infer<typeof projectDiscoverResultSchema>;

/** A `git push --dry-run` reaches origin over the network. */
export const PROJECT_PUSH_CHECK_TIMEOUT_MS = 30_000;

/** `project.push_check`: the path of a repository, as `project.inspect` takes it. */
export const projectPushCheckArgsSchema = z.strictObject({
  path: absolutePathSchema,
});
export type ProjectPushCheckArgs = z.infer<typeof projectPushCheckArgsSchema>;

export const projectPushCheckResultSchema = z.object({
  /** origin accepted the dry-run push: the runner can push branches there. */
  ok: z.boolean(),
  /** origin's URL with any credentials removed; null when there is none. */
  remote: z.string().max(TEXT_PATH_MAX).nullable(),
  /** What git said, last lines, credentials removed. */
  message: z.string().max(TEXT_MESSAGE_MAX),
});
export type ProjectPushCheckResult = z.infer<
  typeof projectPushCheckResultSchema
>;

/**
 * Admin only, as `project.inspect`: discovery lists folders across the
 * allowed roots and the push check takes any path the policy allows.
 */
export const projectConnectCommands = {
  'project.discover': {
    args: projectDiscoverArgsSchema,
    result: projectDiscoverResultSchema,
    minRole: 'admin',
    timeoutMs: PROJECT_DISCOVER_TIMEOUT_MS,
  },
  'project.push_check': {
    args: projectPushCheckArgsSchema,
    result: projectPushCheckResultSchema,
    minRole: 'admin',
    timeoutMs: PROJECT_PUSH_CHECK_TIMEOUT_MS,
  },
} as const satisfies Record<string, CommandDefinition>;

export type ProjectConnectCommandName = keyof typeof projectConnectCommands;
