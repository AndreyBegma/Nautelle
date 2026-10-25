import { describe, expect, mock, test } from 'bun:test';
import type { ProjectSummary, StewardDigestView } from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';

const digests = new Map<string, StewardDigestView | null | Error>();
mock.module('../../lib/steward/actions', () => ({
  fetchLatestDigest: async (projectId: string) => {
    const found = digests.get(projectId) ?? null;
    if (found instanceof Error) throw found;
    return found;
  },
}));

let sectionData: unknown;
mock.module('../../lib/section/use-section', () => ({
  useSection: () => ({
    data: sectionData,
    error: null,
    loading: false,
    retry: () => {},
    setData: () => {},
  }),
}));

const { DigestPanel, loadDigests } = await import('./digest-panel');

const project = (id: string, displayName: string) =>
  ({ id, displayName }) as unknown as ProjectSummary;

const digest = (
  projectId: string,
  over: Partial<StewardDigestView> = {},
): StewardDigestView => ({
  id: `d-${projectId}`,
  projectId,
  trigger: 'daily',
  createdAt: '2026-10-25T08:00:00.000Z',
  from: '2026-10-24T08:00:00.000Z',
  to: '2026-10-25T08:00:00.000Z',
  prose: null,
  done: [],
  stuck: [],
  waiting: [],
  spendUsd: '1.5',
  ...over,
});

const item = (label: string, title: string) => ({
  label,
  title,
  reason: null,
  url: null,
});

const render = (projects: ProjectSummary[]) =>
  renderToStaticMarkup(<DigestPanel projects={projects} />);

describe('DigestPanel', () => {
  test('renders the prose of a digest under the Steward digest heading', async () => {
    const alpha = project('p1', 'Alpha');
    digests.set(
      'p1',
      digest('p1', {
        prose: 'Two cards merged overnight.',
        done: [item('C-1', 'Ship the thing')],
      }),
    );
    sectionData = await loadDigests([alpha]);
    const html = render([alpha]);
    expect(html).toContain('Steward digest');
    expect(html).toContain('Alpha');
    expect(html).toContain('Two cards merged overnight.');
    expect(html).toContain('1 done · 0 stuck · 0 waiting on you');
    expect(html).toContain('Ship the thing');
  });

  test('without prose it falls back to the counts and lines', async () => {
    const beta = project('p2', 'Beta');
    digests.set(
      'p2',
      digest('p2', {
        prose: null,
        stuck: [{ ...item('C-2', 'Stuck card'), reason: 'no runner' }],
      }),
    );
    sectionData = await loadDigests([beta]);
    const html = render([beta]);
    expect(html).toContain('0 done · 1 stuck · 0 waiting on you');
    expect(html).toContain('Stuck card');
    expect(html).toContain('no runner');
  });

  test('a project without a digest shows the empty state', async () => {
    const gamma = project('p3', 'Gamma');
    digests.set('p3', null);
    sectionData = await loadDigests([gamma]);
    const html = render([gamma]);
    expect(html).toContain('No digest yet.');
    expect(html).not.toContain('Gamma');
  });

  test('a project that did not answer is reported next to the others', async () => {
    const ok = project('p4', 'Delta');
    const bad = project('p5', 'Epsilon');
    digests.set('p4', digest('p4', { prose: 'Quiet night.' }));
    digests.set('p5', new Error('offline'));
    sectionData = await loadDigests([ok, bad]);
    const html = render([ok, bad]);
    expect(html).toContain('Quiet night.');
    expect(html).toContain(
      'One project did not answer; its digest is not shown.',
    );
  });

  test('when every project fails to answer, the empty state says so', async () => {
    const bad = project('p6', 'Zeta');
    digests.set('p6', new Error('offline'));
    sectionData = await loadDigests([bad]);
    expect(render([bad])).toContain('Some projects did not answer');
  });
});
