import {
  DEFAULT_VIEWPORTS,
  type DesignRevisionView,
  type TaskDesignView,
  type ViewportPreset,
} from '@nautelle/shared';
import { approvableRevision, previewRevision } from '../board/stack-page';
import { designWriteBlock } from './comments';

/**
 * C-394: what the in-place review (card sheet, stack page, Inbox row) shows
 * and offers for a design. It is only for a design that waits for a decision.
 */
export interface DesignReviewState {
  /** The revision whose frames are previewed; null before anything is drawn. */
  preview: DesignRevisionView | null;
  /** The revision Approve takes: the only variant in play. Null when several compete. */
  approvable: DesignRevisionView | null;
  /** Why Approve and Back with comment are off, or null when they are on. */
  blocked: string | null;
}

/** Whether a design is waiting for a person: drawn, in review, nothing running. */
export const isAwaitingReview = (design: TaskDesignView): boolean =>
  design.needed &&
  design.status === 'reviewing' &&
  design.activeTurnId === null;

/** The in-place review of a design: the preview, and why its actions are off if they are. */
export function designReviewState(
  design: TaskDesignView,
  canOperate: boolean,
): DesignReviewState {
  const approvable = approvableRevision(design);
  const base = designWriteBlock(design, canOperate);
  const blocked =
    base ??
    (approvable === null
      ? 'Several variants are in play: open the viewer and pick one.'
      : null);
  return { preview: previewRevision(design), approvable, blocked };
}

/**
 * The preset thumbnails are laid out at: the widest of the design's devices
 * (or the viewer's presets), so a thumbnail shows the full-size layout.
 */
export function thumbnailPreset(design: TaskDesignView): ViewportPreset {
  const presets = design.devices?.length
    ? design.devices
    : design.viewports.length > 0
      ? design.viewports
      : DEFAULT_VIEWPORTS;
  return presets.reduce((wide, p) => (p.width > wide.width ? p : wide));
}

/** A frame's thumbnail label: "Breakdown · 2 of 3". */
export const frameCaption = (
  name: string,
  position: number,
  total: number,
): string => (total > 1 ? `${name} · ${position + 1} of ${total}` : name);
