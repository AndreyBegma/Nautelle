import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { join } from 'node:path';
import type { CardHeadDeltaArgs } from '@nautelle/shared/protocol';
import { CommandFailure } from '../commands/failure';
import type { Exec } from '../detect/exec';
import { skillsWorkspace } from '../skills/testing';
import { REAL_PROCESS_TIMEOUT_MS } from '../testing/projects';
import { cardHeadDelta } from './head-delta';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS * 2);

/**
 * C-457: `card.headDelta` against real git. A developer's clone pushes the
 * card branch and the base to the bare origin; the runner's project root has
 * fetched none of it, so every answer also proves the fetch.
 */
let teardown: (() => void)[] = [];
afterEach(() => {
  for (const fn of teardown.reverse()) fn();
  teardown = [];
});

const setup = async () => {
  const f = await skillsWorkspace();
  teardown.push(f.cleanup);
  const dev = join(f.ws, 'dev');
  await f.run(f.ws, 'clone', '-q', f.origin, dev);
  await f.run(dev, 'switch', '-q', '-c', 'card');
  f.write(dev, { 'src/card.txt': 'the card\n' });
  const from = await f.commitAll(dev, 'card change');
  await f.run(dev, 'push', '-q', 'origin', 'card');

  /** Commits `files` on `branch` (from main when new) and pushes it. */
  const onBranch = async (branch: string, files: Record<string, string>) => {
    await f
      .run(dev, 'switch', '-q', '-C', branch, `origin/${branch}`)
      .catch(() => f.run(dev, 'switch', '-q', '-c', branch, 'origin/main'));
    f.write(dev, files);
    const sha = await f.commitAll(dev, `${branch} change`);
    await f.run(dev, 'push', '-q', 'origin', branch);
    await f.run(dev, 'fetch', '-q', 'origin');
    await f.run(dev, 'switch', '-q', 'card');
    return sha;
  };
  const push = async () => {
    await f.run(dev, 'push', '-q', 'origin', 'card');
    return f.run(dev, 'rev-parse', 'HEAD');
  };
  const ask = (to: string, overrides: Partial<CardHeadDeltaArgs> = {}) =>
    cardHeadDelta(
      {
        cardId: 'card_1',
        projectId: f.project.id,
        root: f.root,
        from,
        to,
        base: 'main',
        ...overrides,
      },
      { exec: f.git, watchedProjects: () => [f.project] },
    );
  return { f, dev, from, onBranch, push, ask };
};

describe('card.headDelta (C-457)', () => {
  it('answers true for a clean merge of the base into the earlier head', async () => {
    const { f, dev, onBranch, push, ask } = await setup();
    await onBranch('main', { 'README.md': '# widget, updated\n' });
    await f.run(dev, 'merge', '-q', '--no-edit', 'origin/main');
    expect(await ask(await push())).toEqual({ baseMerge: true });
  });

  it('answers tree_differs for a conflict resolved by hand', async () => {
    const { f, dev, onBranch, push, ask } = await setup();
    await onBranch('main', { 'src/app.txt': 'base\n' });
    f.write(dev, { 'src/app.txt': 'card\n' });
    const from = await f.commitAll(dev, 'card edits app');
    await f.run(dev, 'push', '-q', 'origin', 'card');
    await f
      .run(dev, 'merge', '-q', '--no-edit', 'origin/main')
      .catch(() => null);
    f.write(dev, { 'src/app.txt': 'card and base\n' });
    await f.commitAll(dev, 'merge main by hand');
    expect(await ask(await push(), { from })).toEqual({
      baseMerge: false,
      reason: 'tree_differs',
    });
  });

  it('answers tree_differs for a clean merge with an extra edit', async () => {
    const { f, dev, onBranch, push, ask } = await setup();
    await onBranch('main', { 'README.md': '# widget, updated\n' });
    await f.run(dev, 'merge', '-q', '--no-commit', 'origin/main');
    f.write(dev, { 'src/card.txt': 'the card, edited in the merge\n' });
    await f.commitAll(dev, 'merge main and edit');
    expect(await ask(await push())).toEqual({
      baseMerge: false,
      reason: 'tree_differs',
    });
  });

  it('answers not_a_merge for a normal commit', async () => {
    const { f, dev, push, ask } = await setup();
    f.write(dev, { 'src/card.txt': 'the card, again\n' });
    await f.commitAll(dev, 'more card work');
    expect(await ask(await push())).toEqual({
      baseMerge: false,
      reason: 'not_a_merge',
    });
  });

  it('answers not_on_base for a merge of a branch that is not the base', async () => {
    const { f, dev, onBranch, push, ask } = await setup();
    await onBranch('other', { 'src/other.txt': 'other\n' });
    await f.run(dev, 'merge', '-q', '--no-edit', 'origin/other');
    expect(await ask(await push())).toEqual({
      baseMerge: false,
      reason: 'not_on_base',
    });
  });

  it('answers parent_mismatch when neither parent is the earlier head', async () => {
    const { f, dev, onBranch, push, ask } = await setup();
    f.write(dev, { 'src/card.txt': 'the card, again\n' });
    await f.commitAll(dev, 'more card work');
    await onBranch('main', { 'README.md': '# widget, updated\n' });
    await f.run(dev, 'merge', '-q', '--no-edit', 'origin/main');
    expect(await ask(await push())).toEqual({
      baseMerge: false,
      reason: 'parent_mismatch',
    });
  });

  it('answers unknown_commit for a head origin does not have', async () => {
    const { ask } = await setup();
    expect(await ask('0123456789abcdef0123456789abcdef01234567')).toEqual({
      baseMerge: false,
      reason: 'unknown_commit',
    });
  });

  it('answers git_too_old for a git without merge-tree --write-tree', async () => {
    const { f, from } = await setup();
    const oldGit: Exec = async (binary, args, options) =>
      binary === 'git' && args[0] === 'version'
        ? { code: 0, stdout: 'git version 2.37.3\n', stderr: '' }
        : f.git(binary, args, options);
    expect(
      await cardHeadDelta(
        {
          cardId: 'card_1',
          projectId: f.project.id,
          root: f.root,
          from,
          to: from,
          base: 'main',
        },
        { exec: oldGit, watchedProjects: () => [f.project] },
      ),
    ).toEqual({ baseMerge: false, reason: 'git_too_old' });
  });

  it('refuses a root that is not a watched project', async () => {
    const { f, from, ask } = await setup();
    await expect(ask(from, { root: f.ws })).rejects.toBeInstanceOf(
      CommandFailure,
    );
  });
});
