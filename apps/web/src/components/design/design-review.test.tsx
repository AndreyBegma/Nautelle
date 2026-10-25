import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { design, framesOf, revision } from '../../lib/design/fixtures';
import { DesignReview, type DesignReviewActions } from './design-review';

const actions: DesignReviewActions = {
  approve: async () => {},
  comment: async () => {},
  revise: async () => {},
};

const oneVariant = (frames: readonly string[] = ['Mockup']) =>
  design({
    revisions: [
      revision({ id: 'rev-1-1' }),
      revision({
        id: 'rev-1-2',
        revision: 2,
        frames: framesOf('rev-1-2', frames),
      }),
    ],
  });

const render = (
  over: Partial<Parameters<typeof DesignReview>[0]> = {},
): string =>
  renderToStaticMarkup(
    <DesignReview
      design={oneVariant()}
      label="C-12"
      viewerHref="/projects/p1/board/cards/12/design"
      canOperate
      busy={null}
      actions={actions}
      consequence="The card waits in To Do."
      {...over}
    />,
  );

describe('DesignReview (C-394)', () => {
  test('previews the latest revision, one thumbnail per frame', () => {
    const html = render({ design: oneVariant(['Breakdown', 'States']) });
    expect(html).toContain('Zoom in: Breakdown · 1 of 2');
    expect(html).toContain('Zoom in: States · 2 of 2');
    expect(html).toContain('Back with comment');
    expect(html).toContain('Open viewer');
  });

  test('Approve & run is offered only when the worker does not start by itself', () => {
    expect(render()).not.toContain('Approve &amp; run');
    expect(render({ onApproveAndRun: async () => {} })).toContain(
      'Approve &amp; run',
    );
  });

  test('a viewer reads the design and is sent to the viewer', () => {
    const html = render({ canOperate: false });
    expect(html).not.toContain('Back with comment');
    expect(html).not.toContain('>Approve<');
    expect(html).toContain('Open viewer');
  });

  test('several variants disable the decision and say why', () => {
    const html = render({ design: design() });
    expect(html).toContain('Several variants are in play');
  });

  test('Back with comment says why a card’s stack design holds it', () => {
    const html = render({ stackBlock: 'Waiting for the stack design' });
    expect(html).toContain('Waiting for the stack design');
  });

  test('nothing to preview before the first revision', () => {
    expect(render({ design: design({ revisions: [] }) })).toBe('');
  });
});
