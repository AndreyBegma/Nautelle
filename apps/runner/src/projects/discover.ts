import { basename, join } from 'node:path';
import {
  DISCOVER_DEPTH_MAX,
  DISCOVER_DIRECTORIES_MAX,
  DISCOVER_REPOSITORIES_MAX,
  type DiscoveredRepository,
  type ProjectDiscoverResult,
} from '@nautelle/shared/protocol';
import { stripUrlCredentials } from '../redact-url';
import { isDirectory, nodeFs, type ProjectFs } from './fs';
import { parseRemote } from './remote';

/** Folders that never hold a project worth connecting, and are often huge. */
const SKIPPED = new Set(['node_modules', 'vendor', 'target', 'dist', 'build']);

/**
 * The `url` of `[remote "origin"]` in a `.git/config`, or null. Read as text:
 * discovery runs no git, so a repository's config cannot run anything.
 */
export const originUrlIn = (config: string): string | null => {
  let inOrigin = false;
  for (const raw of config.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line);
      continue;
    }
    if (!inOrigin) continue;
    const match = line.match(/^url\s*=\s*(.+)$/);
    if (match) return match[1].trim().replace(/^"(.*)"$/, '$1') || null;
  }
  return null;
};

const describe = (
  fs: ProjectFs,
  path: string,
  root: string,
): DiscoveredRepository => {
  const config = fs.readFile(join(path, '.git', 'config'));
  const origin = config ? originUrlIn(config) : null;
  const remote = origin ? parseRemote(stripUrlCredentials(origin).url) : null;
  return {
    path,
    name: basename(path) || path,
    repo: remote?.forge === 'github' ? remote.repo : null,
    root,
  };
};

/**
 * `project.discover` (C-396, ADR-0103): the git main checkouts under the
 * allowed roots, for the connect dialog's picker. A folder whose `.git` is a
 * directory is a main checkout and is not walked further; a `.git` file is a
 * linked worktree or a submodule and is skipped. Hidden folders, symlinks and
 * build folders are not followed. The walk is bounded by depth, folder count
 * and repository count, and reports when it stopped early.
 */
export const discoverProjects = (
  allowedRoots: readonly string[],
  fs: ProjectFs = nodeFs,
): ProjectDiscoverResult => {
  const found = new Map<string, DiscoveredRepository>();
  let visited = 0;
  let truncated = false;
  const roots: string[] = [];

  for (const allowed of allowedRoots) {
    const root = fs.realpath(allowed);
    if (!root || !isDirectory(fs, root)) continue;
    roots.push(root);
    const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      if (visited >= DISCOVER_DIRECTORIES_MAX) {
        truncated = true;
        break;
      }
      visited += 1;
      const entries = fs.readdir(next.path);
      const git = entries.find((e) => e.name === '.git');
      if (git?.isDirectory) {
        if (!found.has(next.path)) {
          if (found.size >= DISCOVER_REPOSITORIES_MAX) {
            truncated = true;
            break;
          }
          found.set(next.path, describe(fs, next.path, root));
        }
        continue;
      }
      if (git || next.depth >= DISCOVER_DEPTH_MAX) continue;
      for (const entry of entries) {
        if (!entry.isDirectory || entry.isSymbolicLink) continue;
        if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue;
        queue.push({
          path: join(next.path, entry.name),
          depth: next.depth + 1,
        });
      }
    }
  }

  return {
    roots,
    repositories: [...found.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    truncated,
  };
};
