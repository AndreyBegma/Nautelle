import { describe, expect, test } from 'bun:test';
import { DEFAULT_VIEWPORTS } from '@nautelle/shared';
import { design, revision } from './fixtures';
import {
  designReviewState,
  frameCaption,
  isAwaitingReview,
  thumbnailPreset,
} from './review';

const oneVariant = () =>
  design({
    revisions: [revision(), revision({ id: 'rev-1-2', revision: 2 })],
  });

describe('isAwaitingReview (C-394)', () => {
  test('a drawn design in review with no turn running waits for a person', () => {
    expect(isAwaitingReview(oneVariant())).toBe(true);
  });

  test('a design that is off, running or approved does not', () => {
    expect(isAwaitingReview(design({ needed: false }))).toBe(false);
    expect(isAwaitingReview(design({ activeTurnId: 'turn-1' }))).toBe(false);
    expect(isAwaitingReview(design({ status: 'approved' }))).toBe(false);
    expect(isAwaitingReview(design({ status: 'revising' }))).toBe(false);
  });
});

describe('designReviewState (C-394)', () => {
  test('one variant: the latest revision is previewed and approvable', () => {
    const state = designReviewState(oneVariant(), true);
    expect(state.preview?.id).toBe('rev-1-2');
    expect(state.approvable?.id).toBe('rev-1-2');
    expect(state.blocked).toBeNull();
  });

  test('several variants send the person to the viewer to pick', () => {
    const state = designReviewState(design(), true);
    expect(state.approvable).toBeNull();
    expect(state.blocked).toContain('pick one');
  });

  test('a viewer cannot decide', () => {
    expect(designReviewState(oneVariant(), false).blocked).toContain('Viewers');
  });

  test('a design run under way blocks the decision', () => {
    const state = designReviewState(
      design({ ...oneVariant(), activeTurnId: 'turn-1' }),
      true,
    );
    expect(state.blocked).toContain('under way');
  });
});

describe('thumbnailPreset', () => {
  test('the widest device', () => {
    const widest = Math.max(...DEFAULT_VIEWPORTS.map((p) => p.width));
    expect(thumbnailPreset(design()).width).toBe(widest);
  });

  test('the design’s own devices win over the presets', () => {
    const devices = [{ name: 'Phone', width: 390, height: 844 }];
    expect(thumbnailPreset(design({ devices })).name).toBe('Phone');
  });
});

describe('frameCaption', () => {
  test('a single frame is its name', () => {
    expect(frameCaption('Mockup', 0, 1)).toBe('Mockup');
  });

  test('several frames say their place', () => {
    expect(frameCaption('Breakdown', 1, 3)).toBe('Breakdown · 2 of 3');
  });
});
