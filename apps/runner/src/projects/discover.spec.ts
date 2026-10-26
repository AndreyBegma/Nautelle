import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { join } from 'node:path';
import {
  DISCOVER_DEPTH_MAX,
  projectDiscoverResultSchema,
} from '@nautelle/shared/protocol';
import { REAL_PROCESS_TIMEOUT_MS, spyFs, workspace } from '../testing/projects';
import { discoverProjects, originUrlIn } from './discover';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS);

let ws: ReturnType<typeof workspace>;
afterEach(() => ws?.cleanup());

const discover = (roots: readonly string[]) =>
  projectDiscoverResultSchema.parse(discoverProjects(roots));

describe('project.discover', () => {
  it('lists main checkouts under the allowed roots with their GitHub repo', async () => {
    ws = workspace();
    const app = await ws.repo(
      'app',
      'https://user:tok@github.com/acme/app.git',
    );
    const lib = await ws.repo('team/lib', 'git@github.com:acme/lib.git');
    const local = await ws.repo('team/local');
    const gitlab = await ws.repo('gl', 'git@gitlab.example.com:t/gl.git');

    expect(discover([ws.ws])).toEqual({
      roots: [ws.ws],
      repositories: [
        { path: app, name: 'app', repo: 'acme/app', root: ws.ws },
        { path: gitlab, name: 'gl', repo: null, root: ws.ws },
        { path: lib, name: 'lib', repo: 'acme/lib', root: ws.ws },
        { path: local, name: 'local', repo: null, root: ws.ws },
      ],
      truncated: false,
    });
  });

  it('skips linked worktrees, nested folders of a checkout, hidden and build folders', async () => {
    ws = workspace();
    const app = await ws.repo('app', 'git@github.com:acme/app.git');
    await ws.commit('app');
    await ws.run(app, 'worktree', 'add', '-q', '-b', 'i1', join(ws.ws, 'wt'));
    await ws.repo('app/packages/inner');
    await ws.repo('.cache/hidden');
    await ws.repo('node_modules/dep');

    const { repositories } = discover([ws.ws]);
    expect(repositories.map((r) => r.path)).toEqual([app]);
  });

  it(`stops ${DISCOVER_DEPTH_MAX} folders below a root`, async () => {
    ws = workspace();
    const near = await ws.repo('a/b/near');
    await ws.repo('a/b/c/d/far');
    expect(discover([ws.ws]).repositories.map((r) => r.path)).toEqual([near]);
  });

  it('reads no file but each checkout’s .git/config, and walks a root once', async () => {
    ws = workspace();
    const app = await ws.repo('app', 'git@github.com:acme/app.git');
    ws.files({ 'app/README.md': 'x', 'notes.txt': 'x' });
    const { fs, accesses } = spyFs();
    const result = discoverProjects([ws.ws, app], fs);
    expect(result.repositories).toHaveLength(1);
    expect(
      accesses.filter((a) => a.method === 'readFile').map((a) => a.path),
    ).toEqual([join(app, '.git', 'config')]);
  });

  it('answers nothing for no roots or a missing root', () => {
    expect(discover([])).toEqual({
      roots: [],
      repositories: [],
      truncated: false,
    });
    expect(discover(['/nonexistent-c396'])).toEqual({
      roots: [],
      repositories: [],
      truncated: false,
    });
  });
});

describe('originUrlIn', () => {
  it('takes the url of remote "origin" only', () => {
    const config = [
      '[core]',
      '\turl = nope',
      '[remote "upstream"]',
      '\turl = git@github.com:up/x.git',
      '[remote "origin"]',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '\turl = git@github.com:acme/x.git',
    ].join('\n');
    expect(originUrlIn(config)).toBe('git@github.com:acme/x.git');
    expect(originUrlIn('[core]\n')).toBeNull();
  });
});
