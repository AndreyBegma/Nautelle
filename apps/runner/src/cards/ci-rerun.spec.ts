import { describe, expect, it } from 'bun:test';
import {
  type CardCiRerunArgs,
  cardCiRerunArgsSchema,
  cardCiRerunResultSchema,
  type WatchedProject,
} from '@nautelle/shared/protocol';
import type { ExecResult } from '../detect/exec';
import { rerunCardCi } from './ci-rerun';

/**
 * C-414: `card.ciRerun` against a faked `gh` (and the `git remote` the
 * project's GitHub repository is read from).
 */

const HEAD = 'b'.repeat(40);

const project = { id: 'p1', root: '/home/me/widget' } as WatchedProject;

const args: CardCiRerunArgs = {
  cardId: 'card_1',
  projectId: 'p1',
  root: '/home/me/widget',
  pr: 41,
  headSha: HEAD,
  runIds: [123, 456],
};

const ok = (stdout: unknown = ''): ExecResult => ({
  code: 0,
  stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
  stderr: '',
});

const fail = (stderr: string): ExecResult => ({ code: 1, stdout: '', stderr });

interface Fake {
  view?: ExecResult;
  rerun?: Record<string, ExecResult>;
}

const setup = (fake: Fake) => {
  const gh: string[][] = [];
  const exec = async (
    binary: string,
    argv: readonly string[],
  ): Promise<ExecResult | null> => {
    if (binary === 'git') {
      return argv.includes('get-url')
        ? ok('git@github.com:acme/widget.git\n')
        : { code: 1, stdout: '', stderr: '' };
    }
    gh.push([...argv]);
    if (argv[0] === 'pr' && argv[1] === 'view') {
      return fake.view ?? ok({ state: 'OPEN', headRefOid: HEAD });
    }
    if (argv[0] === 'run' && argv[1] === 'rerun') {
      return fake.rerun?.[argv[2] ?? ''] ?? ok();
    }
    return fail('unsupported');
  };
  const run = (a: CardCiRerunArgs = args) =>
    rerunCardCi(a, { exec, watchedProjects: () => [project] });
  return { gh, run };
};

describe('card.ciRerun (C-414)', () => {
  it('re-runs the failed jobs of every run, with argument arrays', async () => {
    const t = setup({});
    const result = await t.run();
    expect(result).toEqual({ rerun: true });
    expect(cardCiRerunResultSchema.safeParse(result).success).toBe(true);
    expect(t.gh).toEqual([
      [
        'pr',
        'view',
        '41',
        '--repo',
        'acme/widget',
        '--json',
        'state,headRefOid',
      ],
      ['run', 'rerun', '123', '--failed', '--repo', 'acme/widget'],
      ['run', 'rerun', '456', '--failed', '--repo', 'acme/widget'],
    ]);
  });

  it('leaves a merged or closed PR alone', async () => {
    for (const state of ['MERGED', 'CLOSED']) {
      const t = setup({ view: ok({ state, headRefOid: HEAD }) });
      expect(await t.run()).toMatchObject({ rerun: false, error: 'not_open' });
      expect(t.gh).toHaveLength(1);
    }
  });

  it('leaves a PR whose head moved on alone — the new head has its own checks', async () => {
    const t = setup({
      view: ok({ state: 'OPEN', headRefOid: 'c'.repeat(40) }),
    });
    expect(await t.run()).toMatchObject({ rerun: false, error: 'head_moved' });
    expect(t.gh).toHaveLength(1);
  });

  it('reports a view gh could not do, and re-runs nothing', async () => {
    const t = setup({ view: fail('HTTP 502: Bad Gateway') });
    expect(await t.run()).toEqual({
      rerun: false,
      error: 'gh_failed',
      message: 'HTTP 502: Bad Gateway',
    });
    expect(t.gh).toHaveLength(1);
  });

  it('tries every run and names the first gh refused', async () => {
    const t = setup({
      rerun: { '123': fail('run 123 is still in progress') },
    });
    expect(await t.run()).toEqual({
      rerun: false,
      error: 'gh_failed',
      message: 'run 123: run 123 is still in progress',
    });
    expect(t.gh.map((a) => a[2])).toEqual(['41', '123', '456']);
  });

  it('takes run ids only as positive integers, at least one', () => {
    for (const runIds of [[], [0], [-1], [1.5], ['1; rm -rf /']]) {
      expect(cardCiRerunArgsSchema.safeParse({ ...args, runIds }).success).toBe(
        false,
      );
    }
  });
});
