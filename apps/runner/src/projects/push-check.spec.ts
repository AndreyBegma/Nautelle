import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { join } from 'node:path';
import { projectPushCheckResultSchema } from '@nautelle/shared/protocol';
import { CommandFailure } from '../commands/failure';
import { REAL_PROCESS_TIMEOUT_MS, workspace } from '../testing/projects';
import { PUSH_CHECK_BRANCH, pushCheck } from './push-check';

setDefaultTimeout(REAL_PROCESS_TIMEOUT_MS);

let ws: ReturnType<typeof workspace>;
afterEach(() => ws?.cleanup());

const check = async (path: string) =>
  projectPushCheckResultSchema.parse(await pushCheck(path, { exec: ws.git }));

describe('project.push_check', () => {
  it('reports ok when origin accepts the dry-run push, and pushes nothing', async () => {
    ws = workspace();
    const origin = join(ws.ws, 'origin.git');
    await ws.repo('origin.git');
    await ws.run(origin, 'config', 'core.bare', 'true');
    const root = await ws.repo('x', origin);
    await ws.commit('x');

    expect(await check(root)).toEqual({
      ok: true,
      remote: origin,
      message: `${origin} accepts pushes.`,
    });
    const refs = await ws.run(origin, 'for-each-ref', '--format=%(refname)');
    expect(refs).not.toContain(PUSH_CHECK_BRANCH);
  });

  it('reports what git said when origin cannot be reached, with credentials removed', async () => {
    ws = workspace();
    const root = await ws.repo(
      'x',
      'https://user:ghp_secret@127.0.0.1:1/o/r.git',
    );
    await ws.commit('x');

    const result = await check(root);
    expect(result.ok).toBe(false);
    expect(result.remote).toBe('https://127.0.0.1:1/o/r.git');
    expect(result.message.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('ghp_secret');
  });

  it('reports a repository without origin', async () => {
    ws = workspace();
    const root = await ws.repo('x');
    expect(await check(root)).toEqual({
      ok: false,
      remote: null,
      message: 'The repository has no `origin` remote.',
    });
  });

  it('answers path_not_found and not_a_repository', async () => {
    ws = workspace();
    ws.files({ 'plain/': '' });
    const code = async (path: string) => {
      try {
        await check(path);
      } catch (error) {
        if (error instanceof CommandFailure) return error.code;
        throw error;
      }
      return null;
    };
    expect(await code(join(ws.ws, 'missing'))).toBe('path_not_found');
    expect(await code(join(ws.ws, 'plain'))).toBe('not_a_repository');
  });
});
