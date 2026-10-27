import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hangingBinaries, isAlive } from '../testing/hanging';
import { createExec, type Exec, type ExecOptions, withSignal } from './exec';

const env = { PATH: process.env.PATH };

describe('createExec timeout', () => {
  it('kills a call that outlives the default', async () => {
    const exec = createExec(env, 100);
    expect(await exec('sleep', ['2'])).toBeNull();
  });

  it('honours a longer per-call timeout over the default', async () => {
    // The default is far below the child's runtime, and the per-call limit far
    // above it, so only the per-call value deciding can let the child finish —
    // a loaded host stretches neither margin into the other.
    const exec = createExec(env, 20);
    const result = await exec('sleep', ['0.5'], { timeoutMs: 60_000 });
    expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('honours a shorter per-call timeout', async () => {
    const exec = createExec(env, 5_000);
    expect(await exec('sleep', ['2'], { timeoutMs: 100 })).toBeNull();
  });
});

describe('createExec signal (#754 D1)', () => {
  it('kills the child when the signal aborts and resolves null', async () => {
    const bins = hangingBinaries(['slow']);
    const exec = createExec(bins.env, 60_000);
    const controller = new AbortController();
    const call = exec('slow', [], { signal: controller.signal });
    const pid = await bins.started();
    expect(isAlive(pid)).toBe(true);
    controller.abort();
    expect(await call).toBeNull();
    expect(isAlive(pid)).toBe(false);
  });

  it('spawns nothing for a signal that already aborted', async () => {
    const bins = hangingBinaries(['slow']);
    const exec = createExec(bins.env, 60_000);
    expect(await exec('slow', [], { signal: AbortSignal.abort() })).toBeNull();
    expect(existsSync(join(bins.dir, 'pids'))).toBe(false);
  });

  it('answers as before when the signal never aborts', async () => {
    const exec = createExec(env, 5_000);
    const controller = new AbortController();
    expect(
      await exec('sh', ['-c', 'echo hi'], { signal: controller.signal }),
    ).toEqual({ code: 0, stdout: 'hi\n', stderr: '' });
  });
});

describe('withSignal', () => {
  const recording = () => {
    const seen: (ExecOptions | undefined)[] = [];
    const exec: Exec = async (_binary, _args, options) => {
      seen.push(options);
      return null;
    };
    return { exec, seen };
  };

  it('adds the signal to every call, keeping its other options', async () => {
    const { exec, seen } = recording();
    const signal = new AbortController().signal;
    await withSignal(exec, signal)('gh', [], { timeoutMs: 7 });
    await withSignal(exec, signal)('git', []);
    expect(seen).toEqual([{ timeoutMs: 7, signal }, { signal }]);
  });

  it("keeps a call's own signal", async () => {
    const { exec, seen } = recording();
    const own = new AbortController().signal;
    await withSignal(exec, new AbortController().signal)('gh', [], {
      signal: own,
    });
    expect(seen[0]?.signal).toBe(own);
  });

  it('returns exec itself without a signal', () => {
    const { exec } = recording();
    expect(withSignal(exec, undefined)).toBe(exec);
  });
});
