import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CardStore } from '../cards/record';
import { FILTER_RAW_DIR, FILTER_STATS_FILE } from './env';
import { RAW_TOTAL_CHECK_MS, RawFile, removeRawDir } from './raw-store';

describe('raw store (#445 amendment 6, DR-07)', () => {
  let dir: string;
  const raw = () => join(dir, FILTER_RAW_DIR);
  const logs = () => readdirSync(raw()).sort();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'raw-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a run dir under its total cap, oldest files first', () => {
    mkdirSync(raw());
    for (let n = 1; n <= 5; n++) {
      writeFileSync(join(raw(), `${n}.log`), 'x'.repeat(100));
    }
    writeFileSync(join(raw(), 'notes.txt'), 'x'.repeat(1000));
    // Room for 300 bytes besides the new file's own cap of 100.
    const file = RawFile.create(dir, 100, 400);
    file.write(new TextEncoder().encode('new'));
    file.close();
    // 1 and 2 go; the new file takes the next free number after the listing.
    expect(logs().sort()).toEqual([
      '3.log',
      '4.log',
      '5.log',
      '7.log',
      'notes.txt',
    ]);
  });

  it('deletes nothing under the cap', () => {
    mkdirSync(raw());
    writeFileSync(join(raw(), '1.log'), 'x'.repeat(10));
    RawFile.create(dir, 100, 400).close();
    expect(logs()).toEqual(['1.log', '2.log']);
  });

  it('drops the earlier rounds’ raw outputs when a card starts a round', () => {
    const store = new CardStore(join(dir, 'cards'));
    const first = store.createRound('card_1', 'run_1');
    RawFile.create(first).close();
    writeFileSync(join(first, FILTER_STATS_FILE), '');
    const second = store.createRound('card_1', 'run_2');
    RawFile.create(second).close();
    expect(existsSync(join(first, FILTER_RAW_DIR))).toBe(false);
    expect(existsSync(join(first, FILTER_STATS_FILE))).toBe(true);
    // Reusing the current round keeps its own raw outputs.
    store.createRound('card_1', 'run_2');
    expect(existsSync(join(second, FILTER_RAW_DIR, '1.log'))).toBe(true);
  });

  it('removes the raw outputs with the run, and nothing else', () => {
    RawFile.create(dir).close();
    writeFileSync(join(dir, FILTER_STATS_FILE), '');
    removeRawDir(dir);
    expect(existsSync(raw())).toBe(false);
    expect(existsSync(join(dir, FILTER_STATS_FILE))).toBe(true);
    // A second removal, or one of a dir that never had raw files, is fine.
    removeRawDir(dir);
    removeRawDir(join(dir, 'missing'));
  });

  describe('total cap across run dirs', () => {
    const CAP = 1000;
    const START = Date.parse('2026-10-26T10:00:00Z');
    const runDirs = () =>
      ['a', 'b', 'c', 'current'].map((n) =>
        join(dir, 'cards', `card_${n}`, 'rounds', 'r1'),
      );
    const seed = (runDir: string, n: number, size: number, ageMs: number) => {
      mkdirSync(join(runDir, FILTER_RAW_DIR), { recursive: true });
      const path = join(runDir, FILTER_RAW_DIR, `${n}.log`);
      writeFileSync(path, 'x'.repeat(size));
      const at = new Date(START - ageMs);
      utimesSync(path, at, at);
    };
    const left = (runDir: string) => {
      try {
        return readdirSync(join(runDir, FILTER_RAW_DIR)).sort();
      } catch {
        return [];
      }
    };
    const total = { stateDir: undefined as string | undefined };
    const options = (now = START) => ({
      stateDir: total.stateDir,
      capBytes: CAP,
      now: () => now,
    });

    beforeEach(() => {
      total.stateDir = dir;
    });

    it('prunes the oldest files across run dirs down to 80 %, sparing the current run', () => {
      const [a, b, c, current] = runDirs() as [string, string, string, string];
      // 1400 bytes in total, interleaved by age: oldest first b1, a1, c1, b2, a2.
      seed(b, 1, 300, 5000);
      seed(a, 1, 300, 4000);
      seed(c, 1, 300, 3000);
      seed(b, 2, 200, 2000);
      seed(a, 2, 200, 1000);
      // The current run's file is the oldest of all and must stay.
      seed(current, 1, 100, 9000);
      RawFile.create(current, 10, 10_000, options()).close();
      // 1400 > 1000: go down to 800 → b1 and a1 are enough, c1 stays.
      expect(left(b)).toEqual(['2.log']);
      expect(left(a)).toEqual(['2.log']);
      expect(left(c)).toEqual(['1.log']);
      expect(left(current)).toEqual(['1.log', '2.log']);
    });

    it('stops at the 80 % line, not at the cap', () => {
      const [a, b, , current] = runDirs() as [string, string, string, string];
      seed(a, 1, 600, 3000);
      seed(b, 1, 500, 2000);
      RawFile.create(current, 10, 10_000, options()).close();
      // 1100 > 1000 → 800 wanted: a1 goes (500 left), b1 stays.
      expect(left(a)).toEqual([]);
      expect(left(b)).toEqual(['1.log']);
    });

    it('leaves everything alone under the cap', () => {
      const [a, , , current] = runDirs() as [string, string, string, string];
      seed(a, 1, 500, 1000);
      RawFile.create(current, 10, 10_000, options()).close();
      expect(left(a)).toEqual(['1.log']);
    });

    it('never prunes the current run, even when it is the whole total', () => {
      const [, , , current] = runDirs() as [string, string, string, string];
      seed(current, 1, 900, 1000);
      seed(current, 2, 900, 500);
      RawFile.create(current, 10, 10_000, options()).close();
      expect(left(current)).toEqual(['1.log', '2.log', '3.log']);
    });

    it('checks the total once a minute', () => {
      const [a, b, , current] = runDirs() as [string, string, string, string];
      seed(a, 1, 1200, 3000);
      RawFile.create(current, 10, 10_000, options()).close();
      expect(left(a)).toEqual([]);
      // Over the cap again, but inside the minute: not looked at.
      seed(b, 1, 1200, 2000);
      RawFile.create(
        current,
        10,
        10_000,
        options(START + RAW_TOTAL_CHECK_MS - 1),
      ).close();
      expect(left(b)).toEqual(['1.log']);
      // A minute after the last check it is.
      RawFile.create(
        current,
        10,
        10_000,
        options(START + RAW_TOTAL_CHECK_MS),
      ).close();
      expect(left(b)).toEqual([]);
      expect(
        Math.round(statSync(join(dir, '.raw-total-checked')).mtimeMs),
      ).toBe(START + RAW_TOTAL_CHECK_MS);
    });

    it('finds the state dir above the run dir by itself', () => {
      const [a, , , current] = runDirs() as [string, string, string, string];
      seed(a, 1, 10, 1000);
      RawFile.create(current, 10, 10_000).close();
      // Real clock, real cap: nothing is over it, but the check ran.
      expect(left(a)).toEqual(['1.log']);
      expect(existsSync(join(dir, '.raw-total-checked'))).toBe(true);
    });

    it('does nothing for a run dir outside the state dir layout', () => {
      RawFile.create(dir).close();
      expect(existsSync(join(dir, '.raw-total-checked'))).toBe(false);
    });
  });
});
