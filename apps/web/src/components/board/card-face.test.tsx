import { describe, expect, test } from 'bun:test';
import type {
  BoardCardView,
  BoardColumn,
  BoardPlanTaskView,
} from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { card as fixtureCard, round } from '../../lib/board/fixtures';
import { CardFace } from './card-face';
import { PlanTaskFace } from './plan-task-face';
import { TAP } from './tap';

const COLUMNS: BoardColumn[] = ['todo', 'in_progress', 'finished', 'completed'];

/** Stands in for the Board's `slots.menu`. */
const MENU = <button type="button" data-menu-trigger aria-label="Actions" />;

const render = (
  column: BoardColumn,
  extra: Partial<BoardCardView> = {},
  options: { menu?: boolean } = {},
) =>
  renderToStaticMarkup(
    <CardFace
      projectId="p1"
      canOperate
      menu={options.menu === false ? undefined : MENU}
      onOpen={() => undefined}
      card={fixtureCard(7, column, {
        prNumber: 7,
        prUrl: 'https://github.com/o/r/pull/7',
        prState: 'open',
        ...extra,
      })}
    />,
  );

/** The markup of one `data-card-row`, up to the next row or the end. */
const row = (html: string, name: 'header' | 'status' | 'footer') => {
  const start = html.indexOf(`data-card-row="${name}"`);
  if (start < 0) return null;
  const next = html.indexOf('data-card-row="', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
};

const design = (status: 'reviewing' | 'approved'): BoardCardView['design'] => ({
  needed: true,
  suggested: false,
  suggestionWhy: null,
  variantCount: 1,
  status,
  approvedRevisionId: status === 'approved' ? 'rev-1' : null,
  busySince: null,
});

describe('CardFace pull request link (#329 D6)', () => {
  for (const column of COLUMNS) {
    test(`shows PR #7 with its state in ${column}`, () => {
      const html = render(column);
      expect(html).toContain('PR #7 · Open');
      expect(html).toContain('href="https://github.com/o/r/pull/7"');
    });
  }

  test('shows the merged state, and a bare number while the state is unknown', () => {
    expect(render('completed', { prState: 'merged' })).toContain(
      'PR #7 · Merged',
    );
    const unknown = render('in_progress', { prState: null });
    expect(unknown).toContain('PR #7<');
    expect(unknown).not.toContain('·');
  });
});

describe('CardFace thin face (C-392)', () => {
  const failure = {
    code: 'unknown' as const,
    message: 'boom',
    at: '2026-10-16T10:00:00.000Z',
  };

  test('the header holds the label, the kind icon, the icons and the menu', () => {
    const header =
      row(
        render('in_progress', {
          kind: 'bug',
          design: design('approved'),
        }),
        'header',
      ) ?? '';
    expect(header.indexOf('C-7')).toBeLessThan(
      header.indexOf('data-kind-icon'),
    );
    expect(header).toContain('aria-label="Bug"');
    expect(header).toContain('aria-label="Design approved"');
    expect(header.indexOf('data-design-icon')).toBeLessThan(
      header.indexOf('data-menu-trigger'),
    );
    expect(header).not.toContain('>Bug<');
  });

  test('a dependency and a ready demo are icons with accessible names', () => {
    const header =
      row(
        render('todo', {
          dependsOn: [{ label: 'C-3', column: 'in_progress' }] as never,
          demo: { status: 'ready', durationMs: 42_000 } as never,
        }),
        'header',
      ) ?? '';
    expect(header).toContain('data-dependency-icon');
    expect(header).toContain('aria-label="Runs after C-3.');
    expect(header).toContain('data-demo-icon');
    expect(header).toContain('aria-label="Demo ready');
  });

  test('a card with nothing to flag draws no icons and no state', () => {
    const html = render('todo');
    expect(html).not.toContain('data-design-icon');
    expect(html).not.toContain('data-dependency-icon');
    expect(html).not.toContain('data-demo-icon');
    expect(html).not.toContain('data-face-state');
  });

  test('a running round is the one state signal', () => {
    const status =
      row(render('in_progress', { round: round('running') }), 'status') ?? '';
    expect(status).toContain('data-face-state="running"');
    expect(status.split('data-face-state').length).toBe(2);
  });

  test('the PR with its CI dot is the footer; the issue, cost and attachments are not', () => {
    const html = render('in_progress', {
      ciState: 'green',
      costUsd: '0.3',
      attachmentCount: 2,
      issueNumber: 3,
      issueUrl: 'https://github.com/o/r/issues/3',
    });
    const footer = row(html, 'footer') ?? '';
    expect(footer).toContain('PR #7 · Open');
    expect(footer).toContain('aria-label="Checks passed"');
    expect(html).not.toContain('$0.30');
    expect(html).not.toContain('Issue #3');
    expect(html).not.toContain('Paperclip');
  });

  test('a card without a PR draws no footer', () => {
    const html = render('todo', { prNumber: null, prUrl: null, prState: null });
    expect(html).not.toContain('data-card-row="footer"');
  });

  test('what left the face does not come back', () => {
    const html = render('in_progress', {
      round: round('running', { hooksMissing: true }),
      autoRunWhenReady: true,
      steward: {
        status: 'open',
        kind: 'api_error',
        attempts: 1,
        max: 2,
      } as never,
      restartMode: 'resume',
      ciState: 'pending',
      costUsd: '0.3',
      tokenSaved: { estimateUsd: 0.004, estimateTokens: 1_000 },
    });
    for (const gone of [
      'Auto-run',
      'Stuck',
      'resumed',
      'Checks running',
      'saved ≈',
      'Hooks',
    ]) {
      expect(row(html, 'status') ?? '').not.toContain(gone);
    }
  });

  test('a failed auto-run is the Failed state', () => {
    const status =
      row(render('todo', { autoRunFailure: failure }), 'status') ?? '';
    expect(status).toContain('data-face-state="error"');
    expect(status).toContain('Failed');
  });

  test('the approve offer sits under the status row, not in the header', () => {
    const html = render('todo', { design: design('reviewing') });
    expect(html).toContain('Approve &amp; run');
    expect(row(html, 'header') ?? '').not.toContain('Approve');
  });

  test('a terminal card keeps its Session link; its badges are in the sheet', () => {
    const html = render('in_progress', {
      source: 'terminal',
      tracking: { sessionId: 's-1', alive: true },
    });
    expect(html).toContain('>Session<');
    expect(row(html, 'status') ?? '').not.toContain('Terminal');
  });

  test('a fleet card keeps its slot line and the Fleet link', () => {
    const html = render('in_progress', {
      source: 'fleet',
      fleet: { issue: 12, slot: 'i12-web', stage: 'pr_open', slotGone: false, detached: false },
    });
    expect(html).toContain('i12-web · PR open');
    expect(html).toContain('Open in Fleet');
  });

  test('a suggestion shows Suggested, its confidence, the why and the source session', () => {
    const html = render('inbox', {
      prNumber: null,
      prUrl: null,
      prState: null,
      captureWhy: 'The session hit three 429s.',
      captureConfidence: 0.82,
      sourceSessionId: 'sess-1',
    });
    const status = row(html, 'status') ?? '';
    expect(status).toContain('Suggested');
    expect(status).toContain('82% sure');
    expect(html).toContain('The session hit three 429s.');
    expect(html).toContain('Source session');
  });

  test('the title and the PR link are touch targets', () => {
    const html = render('in_progress');
    expect(html.split(TAP).length - 1).toBe(2);
  });

  test('the header grows to the touch target only when it holds the menu', () => {
    const coarse = 'pointer-coarse:h-(--size-tap)';
    expect(row(render('todo'), 'header')).toContain(coarse);
    expect(row(render('todo', {}, { menu: false }), 'header')).not.toContain(
      coarse,
    );
  });
});

describe('PlanTaskFace with the inline menu (C-35)', () => {
  const task: BoardPlanTaskView = {
    planId: 'plan-1',
    planTitle: 'Onboarding v2',
    taskId: 'task-t1',
    key: 't1',
    title: 'Task t1',
    kind: 'feature',
    column: 'todo',
    status: 'draft',
    issue: null,
    design: null,
    summary: '',
    updatedAt: '2026-10-14T10:00:00.000Z',
  };

  test('places the menu in its header row, before the title', () => {
    const html = renderToStaticMarkup(
      <PlanTaskFace task={task} menu={MENU} onOpen={() => undefined} />,
    );
    expect(html).toContain('data-menu-trigger');
    expect(html.indexOf('data-menu-trigger')).toBeLessThan(
      html.indexOf('Task t1'),
    );
  });
});

describe('the selection slot (#596)', () => {
  const selected = (
    column: BoardColumn,
    extra: Partial<BoardCardView>,
    selecting: boolean,
  ) =>
    renderToStaticMarkup(
      <CardFace
        projectId="p1"
        canOperate
        menu={MENU}
        onOpen={() => undefined}
        selection={{ selected: false, selecting, onToggle: () => undefined }}
        card={fixtureCard(7, column, extra)}
      />,
    );

  test('the box sits in the header row, inside the card, not over its border', () => {
    const html = selected('todo', {}, false);
    const header = row(html, 'header') ?? '';
    expect(header).toContain('data-selection-box');
    expect(header.indexOf('data-selection-box')).toBeLessThan(
      header.indexOf('C-7'),
    );
    expect(html).not.toMatch(/-start-\[|-top-\[/);
  });

  test('a suggestion keeps the same slot, empty until something is selected', () => {
    const idle = row(selected('inbox', {}, false), 'header');
    const busy = row(selected('inbox', {}, true), 'header');
    expect(idle).toContain('invisible');
    expect(busy).not.toContain('invisible');
    expect(busy).toContain('<svg');
  });

  test('a plan task reserves the slot in its header', () => {
    const task: BoardPlanTaskView = {
      planId: 'plan-1',
      planTitle: 'Onboarding v2',
      taskId: 'task-t1',
      key: 't1',
      title: 'Task t1',
      kind: 'feature',
      column: 'todo',
      status: 'draft',
      issue: null,
      design: null,
      summary: '',
      updatedAt: '2026-10-14T10:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <PlanTaskFace task={task} selecting onOpen={() => undefined} />,
    );
    expect(html).toContain('size-4');
    expect(html).not.toContain('invisible');
  });
});
