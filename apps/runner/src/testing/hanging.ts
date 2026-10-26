import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface HangingBinaries {
  dir: string;
  /** A `PATH` holding only the hanging binaries. */
  env: { PATH: string };
  /** The pid of the first binary that started, once it has. */
  started(): Promise<number>;
}

/**
 * #754: a `PATH` of binaries (`gh`, `git`, `tmux`, …) that record their pid
 * and then never answer — a stand-in for a network call that hangs, so a test
 * can time the command out and check its child is gone.
 */
export const hangingBinaries = (names: readonly string[]): HangingBinaries => {
  const dir = mkdtempSync(join(tmpdir(), 'nautelle-hang-'));
  const bin = join(dir, 'bin');
  const pids = join(dir, 'pids');
  const script = [
    '#!/bin/sh',
    'PATH=/usr/bin:/bin',
    `mkdir -p '${pids}'`,
    `echo $$ > '${pids}/'$$`,
    'exec /bin/sleep 60',
    '',
  ].join('\n');
  mkdirSync(bin);
  for (const name of names) {
    const path = join(bin, name);
    writeFileSync(path, script);
    chmodSync(path, 0o755);
  }
  return {
    dir,
    env: { PATH: bin },
    started: async () => {
      for (let i = 0; i < 500; i++) {
        let listed: string[] = [];
        try {
          listed = readdirSync(pids);
        } catch {
          listed = [];
        }
        if (listed[0]) return Number(listed[0]);
        await Bun.sleep(10);
      }
      throw new Error('no hanging binary started');
    },
  };
};

/** Whether `pid` is a running process (signal 0 only checks). */
export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
