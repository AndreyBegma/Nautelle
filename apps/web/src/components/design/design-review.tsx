'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import { Field, Textarea } from '@andrewbehma/glass-ui/field';
import { toast } from '@andrewbehma/glass-ui/toast';
import {
  DESIGN_COMMENT_MAX,
  type DesignRevisionView,
  type TaskDesignView,
  type ViewportPreset,
} from '@nautelle/shared';
import { Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { backWithComment } from '../../lib/board/design-actions';
import { scaledBox, useZoomReachesFrames } from '../../lib/canvas/frame-zoom';
import { revisionLabel } from '../../lib/design/format';
import {
  designReviewState,
  frameCaption,
  thumbnailPreset,
} from '../../lib/design/review';
import type { DesignBusy } from '../../lib/design/use-design';
import { useElementWidth } from '../../lib/design/use-element-width';
import { fitZoom } from '../../lib/design/zoom';
import { MockupFrame } from './mockup-frame';

/** A thumbnail is cropped to this height; the zoom shows the frame whole. */
const THUMB_HEIGHT_PX = 150;

/** The request each decision makes; the page's design hook supplies them. */
export interface DesignReviewActions {
  approve: (body: { revisionId: string }) => Promise<unknown>;
  comment: (body: {
    revisionId: string;
    kind: 'general';
    body: string;
  }) => Promise<unknown>;
  revise: () => Promise<unknown>;
}

/**
 * One frame, laid out at the preset's width as in a real viewport and drawn
 * scaled to its container. Inert: a click is the wrapper's, not the mockup's.
 */
function ScaledFrame({
  src,
  title,
  preset,
  cropTo,
}: {
  src: string;
  title: string;
  preset: Pick<ViewportPreset, 'width' | 'height'>;
  /** Cap the box height, or null to show the whole frame. */
  cropTo: number | null;
}) {
  const [measure, width] = useElementWidth();
  const byZoom = useZoomReachesFrames();
  const scale = fitZoom(width, preset.width);
  const whole = Math.round(preset.height * scale);
  return (
    <div
      ref={measure}
      className="pointer-events-none relative w-full overflow-hidden rounded-control border border-line bg-surface"
      style={{ height: cropTo === null ? whole : Math.min(cropTo, whole) }}
    >
      {width > 0 ? (
        <div
          style={{
            width: preset.width,
            height: preset.height,
            ...scaledBox(scale, byZoom),
          }}
        >
          <MockupFrame
            src={src}
            title={title}
            theme="light"
            pinMode={false}
            pins={[]}
            onPin={() => {}}
            onWheel={() => {}}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The revision's frames as thumbnails; a click zooms one in a dialog. */
function FrameThumbnails({
  revision,
  preset,
  label,
}: {
  revision: DesignRevisionView;
  preset: ViewportPreset;
  label: string;
}) {
  const [zoomed, setZoomed] = useState<number | null>(null);
  const frames = revision.frames;
  const open = zoomed === null ? undefined : frames[zoomed];
  return (
    <>
      <ul
        aria-label={`${label} frames`}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {frames.map((frame) => {
          const caption = frameCaption(
            frame.name,
            frame.position,
            frames.length,
          );
          return (
            <li key={frame.position}>
              <button
                type="button"
                aria-label={`Zoom in: ${caption}`}
                onClick={() => setZoomed(frame.position)}
                className="group relative flex w-full cursor-zoom-in flex-col gap-1 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ScaledFrame
                  src={frame.htmlUrl}
                  title={`${label} · ${caption}`}
                  preset={preset}
                  cropTo={THUMB_HEIGHT_PX}
                />
                <span className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  <span className="truncate">{caption}</span>
                  <Maximize2 aria-hidden="true" className="size-3 shrink-0" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <DialogRoot
        open={open !== undefined}
        onOpenChange={(next) => {
          if (!next) setZoomed(null);
        }}
      >
        {open ? (
          <DialogContent
            title={frameCaption(open.name, open.position, frames.length)}
            description={`${label} · ${revisionLabel(revision.variant, revision.revision)} — ${revision.title}`}
            className="max-w-4xl"
          >
            <div className="max-h-[70vh] overflow-auto">
              <ScaledFrame
                src={open.htmlUrl}
                title={`${label} · ${open.name} (zoomed)`}
                preset={preset}
                cropTo={null}
              />
            </div>
          </DialogContent>
        ) : null}
      </DialogRoot>
    </>
  );
}

/**
 * C-394: decide a design in place — a card sheet, a stack page or an Inbox row.
 * The latest revision's frames as thumbnails (click to zoom), **Approve**,
 * **Approve and run** (a card whose worker does not start by itself), and
 * **Back with comment**, which saves the comment and starts a revise turn.
 * The full-screen viewer stays for pins; **Open viewer** leads there.
 *
 * Renders nothing before there is a revision to look at.
 */
export function DesignReview({
  design,
  label,
  viewerHref,
  canOperate,
  busy,
  actions,
  consequence,
  onApproveAndRun,
  stackBlock = null,
}: {
  design: TaskDesignView;
  /** What the design belongs to: "C-12", "S-3". */
  label: string;
  viewerHref: string;
  canOperate: boolean;
  busy: DesignBusy | null;
  actions: DesignReviewActions;
  /** What approving does next, said under the buttons. */
  consequence: string;
  /** Present when approving does not start the worker: offers **Approve and run**. */
  onApproveAndRun?: (revisionId: string) => Promise<unknown>;
  /** #527: why a card's own design cannot be revised yet (its stack's is not approved). */
  stackBlock?: string | null;
}) {
  const commentId = useId();
  const [comment, setComment] = useState('');
  const [working, setWorking] = useState(false);
  const state = designReviewState(design, canOperate);
  const { preview, approvable, blocked } = state;
  if (!preview) return null;

  const idle = !working && busy === null;
  const approveOff = blocked !== null || !idle;
  const backBlocked = blocked ?? stackBlock;
  const backOff = backBlocked !== null || !idle || comment.trim() === '';

  /** Runs one decision; a refusal was toasted by the design hook, so it is swallowed here. */
  const decide = async (job: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await job();
    } catch {
      // The hook's toast has said why.
    } finally {
      setWorking(false);
    }
  };

  const approve = () =>
    approvable &&
    decide(async () => {
      await actions.approve({ revisionId: approvable.id });
      toast.success(`Approved ${label}.`);
    });

  const approveRun = () =>
    approvable &&
    onApproveAndRun &&
    decide(() => onApproveAndRun(approvable.id));

  const back = () =>
    decide(async () => {
      let posted = false;
      try {
        await backWithComment(
          {
            comment: async (revisionId, body) => {
              await actions.comment({ revisionId, kind: 'general', body });
              posted = true;
            },
            revise: actions.revise,
          },
          preview.id,
          comment,
        );
        toast.success(`Sent ${label} back for a new revision.`);
      } finally {
        // A saved comment stays on the design even when Revise was refused, so it leaves the field.
        if (posted) setComment('');
      }
    });

  return (
    <section aria-label="Review the design" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold">
          {revisionLabel(preview.variant, preview.revision)} — {preview.title}
        </h4>
        {preview.rationale ? (
          <p className="line-clamp-2 text-xs text-ink-3">{preview.rationale}</p>
        ) : null}
      </div>

      <FrameThumbnails
        revision={preview}
        preset={thumbnailPreset(design)}
        label={label}
      />

      {canOperate ? (
        <>
          <Field
            label="Comment"
            htmlFor={commentId}
            hint="Back with comment saves this on the design and draws a new revision."
          >
            <Textarea
              id={commentId}
              rows={3}
              value={comment}
              maxLength={DESIGN_COMMENT_MAX}
              disabled={backBlocked !== null}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="glass"
              disabled={backOff}
              title={backBlocked ?? undefined}
              onClick={() => void back()}
            >
              {busy === 'revise' || busy === 'comment'
                ? 'Sending back…'
                : 'Back with comment'}
            </Button>
            <Button
              variant={onApproveAndRun ? 'glass' : 'solid'}
              disabled={approveOff}
              title={blocked ?? undefined}
              onClick={() => void approve()}
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
            {onApproveAndRun ? (
              <Button
                variant="solid"
                disabled={approveOff}
                title={blocked ?? undefined}
                onClick={() => void approveRun()}
              >
                Approve &amp; run
              </Button>
            ) : null}
            <Link
              href={viewerHref}
              className={buttonClassName({ variant: 'ghost', size: 'sm' })}
            >
              Open viewer
            </Link>
          </div>
          {blocked ? <p className="text-xs text-ink-3">{blocked}</p> : null}
          <p className="text-xs text-ink-3">{consequence}</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={viewerHref}
            className={buttonClassName({ variant: 'glass', size: 'sm' })}
          >
            Open viewer
          </Link>
          <p className="text-xs text-ink-3">
            Viewers can read a design; an operator reviews it.
          </p>
        </div>
      )}
    </section>
  );
}
