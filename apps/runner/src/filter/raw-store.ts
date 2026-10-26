import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { FILTER_ORCHESTRATOR_DIR, FILTER_RAW_DIR } from './env';

/** One raw file holds at most this much of a command's output (amendment 6). */
export const RAW_CAP_BYTES = 10 * 1024 * 1024;

/**
 * All raw files of one run dir together stay under this (DR-07): before a new
 * file, the oldest go until there is room for one more at its own cap.
 */
export const RAW_DIR_CAP_BYTES = 200 * 1024 * 1024;

/**
 * All raw files of every run dir together stay under this: the oldest go,
 * across directories, down to `RAW_TOTAL_KEEP` of it.
 */
export const RAW_TOTAL_CAP_BYTES = 1024 * 1024 * 1024;

/** A total prune stops at this share of the total cap. */
const RAW_TOTAL_KEEP = 0.8;

/** The total is checked at most this often, across all filter processes. */
export const RAW_TOTAL_CHECK_MS = 60 * 1000;

/** In the state dir; its mtime is the time of the last total check. */
const RAW_TOTAL_MARKER = '.raw-total-checked';

/** The state dir's subdirectories that hold run dirs (the daemon's stats roots). */
const RUN_ROOTS = [
  'runs',
  'plans',
  'uiprofile',
  'cards',
  'capture',
  'normalize',
  'assess',
  FILTER_ORCHESTRATOR_DIR,
];

/** How far below a run root a run dir sits, as for the stats reader. */
const RUN_DIR_DEPTH = 3;

const RAW_NAME = /^(\d+)\.log$/;

export interface RawTotalOptions {
  /** The runner's state dir; by default found above the run dir, `null` for no total cap. */
  stateDir?: string | null;
  capBytes?: number;
  now?: () => number;
}

/** The state dir above a run dir, from the nearest run root among its parents. */
const stateDirOf = (runDir: string): string | null => {
  for (let dir = dirname(runDir); dir !== dirname(dir); dir = dirname(dir)) {
    if (RUN_ROOTS.includes(basename(dir))) return dirname(dir);
  }
  return null;
};

/** Every run dir's `raw` directory under the state dir. */
const findRawDirs = (stateDir: string): string[] => {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === FILTER_RAW_DIR) {
        if (depth > 0) found.push(join(dir, entry.name));
      } else if (depth < RUN_DIR_DEPTH && !entry.name.startsWith('.')) {
        walk(join(dir, entry.name), depth + 1);
      }
    }
  };
  for (const root of RUN_ROOTS) walk(join(stateDir, root), 0);
  return found;
};

/** Claims the check for this minute; false when another one ran within it. */
const claimTotalCheck = (stateDir: string, now: number): boolean => {
  const marker = join(stateDir, RAW_TOTAL_MARKER);
  try {
    const elapsed = now - statSync(marker).mtimeMs;
    if (elapsed >= 0 && elapsed < RAW_TOTAL_CHECK_MS) return false;
  } catch {
    // Never checked.
  }
  try {
    writeFileSync(marker, '', { mode: 0o600 });
    utimesSync(marker, new Date(now), new Date(now));
  } catch {
    return false;
  }
  return true;
};

/**
 * Keeps the raw files of all run dirs under `capBytes` together: over it, the
 * oldest by mtime go first, across directories, down to 80 %. The raw files
 * of `currentRaw` (the run being written) are counted and never deleted.
 */
const pruneTotal = (stateDir: string, currentRaw: string, capBytes: number) => {
  const files: { path: string; mtime: number; size: number }[] = [];
  let total = 0;
  for (const dir of findRawDirs(stateDir)) {
    const current = resolve(dir) === currentRaw;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!RAW_NAME.test(name)) continue;
      const path = join(dir, name);
      try {
        const stat = lstatSync(path);
        if (!stat.isFile()) continue;
        total += stat.size;
        if (!current) {
          files.push({ path, mtime: stat.mtimeMs, size: stat.size });
        }
      } catch {
        // Gone already: another filter pruned it.
      }
    }
  }
  if (total <= capBytes) return;
  files.sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path));
  for (const file of files) {
    if (total <= capBytes * RAW_TOTAL_KEEP) break;
    try {
      unlinkSync(file.path);
    } catch {
      // Gone already.
    }
    total -= file.size;
  }
};

/** Deletes `<n>.log` files, lowest `n` first, until they total at most `keep`. */
const pruneOldest = (dir: string, names: readonly string[], keep: number) => {
  const files: { path: string; n: number; size: number }[] = [];
  let total = 0;
  for (const name of names) {
    const n = RAW_NAME.exec(name)?.[1];
    if (n === undefined) continue;
    const path = join(dir, name);
    try {
      const size = lstatSync(path).size;
      files.push({ path, n: Number(n), size });
      total += size;
    } catch {
      // Gone already: another filter pruned it.
    }
  }
  files.sort((a, b) => a.n - b.n);
  for (const file of files) {
    if (total <= keep) break;
    try {
      unlinkSync(file.path);
    } catch {
      // Gone already.
    }
    total -= file.size;
  }
};

/**
 * Removes a run dir's raw outputs (amendment 6: they go with the run). For
 * the launches whose run dir outlives the run — a card's rounds, the
 * orchestrator's session dir. Never throws.
 */
export const removeRawDir = (runDir: string): void => {
  try {
    rmSync(join(runDir, FILTER_RAW_DIR), { recursive: true, force: true });
  } catch {
    // Nothing to remove, or not ours to remove: the run is over either way.
  }
};

/** Appended to a raw file cut at the cap. */
export const RAW_TRUNCATED_MARKER = `\n[nautelle filter: raw output truncated at ${RAW_CAP_BYTES / 1024 / 1024} MB]\n`;

/**
 * A command's raw output on disk: `<run dir>/raw/<n>.log` (D4a). `n` is the
 * next free number, claimed with an exclusive create, so concurrent filters
 * of one session never share a file.
 */
export class RawFile {
  private written = 0;
  private cut = false;

  private constructor(
    readonly path: string,
    private readonly fd: number,
    private readonly cap: number,
  ) {}

  static create(
    runDir: string,
    cap = RAW_CAP_BYTES,
    dirCap = RAW_DIR_CAP_BYTES,
    totalCap: RawTotalOptions = {},
  ): RawFile {
    const dir = join(runDir, FILTER_RAW_DIR);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      const stateDir =
        totalCap.stateDir === undefined
          ? stateDirOf(runDir)
          : totalCap.stateDir;
      if (stateDir && claimTotalCheck(stateDir, (totalCap.now ?? Date.now)())) {
        pruneTotal(
          stateDir,
          resolve(dir),
          totalCap.capBytes ?? RAW_TOTAL_CAP_BYTES,
        );
      }
    } catch {
      // The total cap is best effort: the new file matters more.
    }
    const names = readdirSync(dir);
    pruneOldest(dir, names, Math.max(0, dirCap - cap));
    let n = names.length + 1;
    for (;;) {
      const path = join(dir, `${n}.log`);
      try {
        return new RawFile(path, openSync(path, 'wx', 0o600), cap);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        n += 1;
      }
    }
  }

  /** Whether the output went past the cap and the file was cut. */
  get truncated(): boolean {
    return this.cut;
  }

  write(chunk: Uint8Array): void {
    if (this.cut) return;
    const room = this.cap - this.written;
    if (chunk.byteLength > room) {
      if (room > 0) writeSync(this.fd, chunk.subarray(0, room));
      writeSync(this.fd, RAW_TRUNCATED_MARKER);
      this.written = this.cap;
      this.cut = true;
      return;
    }
    writeSync(this.fd, chunk);
    this.written += chunk.byteLength;
  }

  close(): void {
    closeSync(this.fd);
  }
}
