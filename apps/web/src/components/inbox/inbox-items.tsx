'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { Field, Select, Textarea } from '@andrewbehma/glass-ui/field';
import { toast } from '@andrewbehma/glass-ui/toast';
import type {
  InboxDesignItem,
  InboxFailedItem,
  InboxMergeItem,
  InboxPermissionItem,
  InboxQuestionItem,
  InboxSetupItem,
} from '@nautelle/shared';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { runCard, sendFeedback } from '../../lib/board/actions';
import {
  approveAndRun,
  approveConsequence,
  offersApproveAndRun,
} from '../../lib/board/design-actions';
import { describeBoardError } from '../../lib/board/format';
import { boardCardHref } from '../../lib/board/href';
import { ciDot } from '../../lib/board/shipping';
import { describeDesignError } from '../../lib/design/format';
import { cardDesignHref } from '../../lib/design/href';
import {
  approveCardDesign,
  commentCardDesign,
  reviseCardDesign,
} from '../../lib/inbox/actions';
import { failedReasonText } from '../../lib/inbox/format';
import { readinessCopy } from '../../lib/readiness/copy';
import { useErrorToast } from '../../lib/section/use-error-toast';
import { cardSessionMessenger } from '../../lib/session-message/actions';
import type { Decision } from '../approvals/action-requests';
import { RequestCell } from '../approvals/action-requests';
import type { CardActions } from '../board/use-card-actions';
import { MockupFrame } from '../design/mockup-frame';
import { SessionMessageLine } from '../session/session-message-line';
import { InboxRow } from './inbox-row';

/**
 * One row per Inbox kind (C-390): each carries what its decision needs and
 * the buttons that make it, through the same requests the Board, the design
 * viewer and the Approvals tab send. `onChanged` refetches the Inbox; the
 * live push would too, a moment later.
 */

/** A card session's question: its options as buttons, or a line of text. */
export function QuestionRow({
  item,
  now,
}: {
  item: InboxQuestionItem;
  now: number;
}) {
  const inputId = useId();
  return (
    <InboxRow item={item} now={now}>
      <SessionMessageLine
        send={cardSessionMessenger(item.projectId, item.card.number)}
        question={item.card.round?.pendingQuestion ?? null}
        label="Reply to the session"
        inputId={inputId}
      />
    </InboxRow>
  );
}

/** A pending action request (a tool use in away mode and the rest of D18). */
export function PermissionRow({
  item,
  now,
  ask,
  busy,
}: {
  item: InboxPermissionItem;
  now: number;
  ask: (request: InboxPermissionItem['request'], decision: Decision) => void;
  busy: boolean;
}) {
  return (
    <InboxRow
      item={item}
      now={now}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => ask(item.request, 'deny')}
          >
            Deny
          </Button>
          <Button
            variant="solid"
            size="sm"
            disabled={busy}
            onClick={() => ask(item.request, 'approve')}
          >
            Allow
          </Button>
        </>
      }
    >
      <RequestCell request={item.request} />
    </InboxRow>
  );
}

/** A line of feedback that sends the card back to In progress. */
function FeedbackForm({
  item,
  onDone,
  onCancel,
}: {
  item: InboxMergeItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendFeedback(item.projectId, item.card.number, {
        text: text.trim(),
      });
      toast.success(`Feedback sent. ${item.card.label} is back in progress.`);
      onDone();
    } catch (error) {
      toast.error(describeBoardError(error));
    } finally {
      setSending(false);
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <Field label="What should change" htmlFor={id}>
        <Textarea
          id={id}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="glass"
          size="sm"
          disabled={sending || !text.trim()}
        >
          {sending ? 'Sending…' : 'Send feedback'}
        </Button>
        <Button variant="ghost" size="sm" disabled={sending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A Finished card ready to merge: its demo, CI and pull request, Merge or Feedback. */
export function MergeRow({
  item,
  now,
  actions,
  onChanged,
}: {
  item: InboxMergeItem;
  now: number;
  actions: CardActions;
  onChanged: () => void;
}) {
  const [feedback, setFeedback] = useState(false);
  const { card, demo } = item;
  const ci = ciDot(card);
  return (
    <InboxRow
      item={item}
      now={now}
      detail={
        <span className="flex flex-wrap items-center gap-2">
          {ci ? <Badge tone={ci.tone} label={ci.label} /> : null}
          {card.prUrl ? (
            <a
              href={card.prUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-ink"
            >
              Pull request #{card.prNumber}
            </a>
          ) : null}
          {demo && !demo.contentUrl ? (
            <span className="text-ink-3">
              {demo.status === 'failed'
                ? 'The demo could not be recorded'
                : 'The demo is still recording'}
            </span>
          ) : null}
        </span>
      }
      actions={
        feedback ? null : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.busy}
              onClick={() => setFeedback(true)}
            >
              Feedback
            </Button>
            <Button
              variant="solid"
              size="sm"
              disabled={actions.busy}
              onClick={() => actions.accept(card)}
            >
              Merge
            </Button>
          </>
        )
      }
    >
      {demo?.contentUrl ? (
        // biome-ignore lint/a11y/useMediaCaption: a screen recording has no speech to caption
        <video
          controls
          preload="metadata"
          src={demo.contentUrl}
          className="w-full max-w-xl rounded-control border border-line bg-black"
          aria-label={`Demo of ${card.label}`}
        />
      ) : null}
      {feedback ? (
        <FeedbackForm
          item={item}
          onCancel={() => setFeedback(false)}
          onDone={() => {
            setFeedback(false);
            onChanged();
          }}
        />
      ) : null}
    </InboxRow>
  );
}

/** The mockup's first frame, drawn at desktop size and scaled into the row. */
const PREVIEW = { width: 1280, height: 800, scale: 0.25 };

function DesignPreview({ src, title }: { src: string; title: string }) {
  return (
    <div
      className="pointer-events-none relative overflow-hidden rounded-control border border-line-strong bg-surface"
      style={{
        width: PREVIEW.width * PREVIEW.scale,
        height: PREVIEW.height * PREVIEW.scale,
      }}
    >
      <div
        style={{
          width: PREVIEW.width,
          height: PREVIEW.height,
          transform: `scale(${PREVIEW.scale})`,
          transformOrigin: 'top left',
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
    </div>
  );
}

/** A design waiting for approval: preview, Approve, Approve and run, Back with comment. */
export function DesignRow({
  item,
  now,
  onChanged,
}: {
  item: InboxDesignItem;
  now: number;
  onChanged: () => void;
}) {
  const { card, projectId, revisions } = item;
  const [variant, setVariant] = useState(revisions[0]?.id ?? '');
  const [confirming, setConfirming] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();
  const commentId = useId();
  const revision = revisions.find((r) => r.id === variant) ?? revisions[0];
  const frame = revision?.frames[0];

  const approve = async () => {
    if (!revision) return;
    setBusy(true);
    try {
      await approveCardDesign(projectId, card.number, {
        revisionId: revision.id,
      });
      toast.success(
        card.continueAfterDesign
          ? `Approved. Started a worker on ${card.label}.`
          : `Approved. ${card.label} waits in To Do.`,
      );
      setConfirming(false);
    } catch (error) {
      showError(describeDesignError(error, projectId));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const approveRun = async () => {
    if (!revision) return;
    setBusy(true);
    let approved = false;
    try {
      await approveAndRun(
        {
          approve: async (id) => {
            await approveCardDesign(projectId, card.number, { revisionId: id });
            approved = true;
          },
          run: () => runCard(projectId, card.number),
        },
        revision.id,
      );
      toast.success(`Approved. Started a worker on ${card.label}.`);
    } catch (error) {
      // A refused Run leaves the design approved: the card waits in To Do.
      if (approved) toast.error(describeBoardError(error));
      else showError(describeDesignError(error, projectId));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const sendBack = async (event: FormEvent) => {
    event.preventDefault();
    if (!revision || !comment.trim()) return;
    setBusy(true);
    try {
      await commentCardDesign(projectId, card.number, {
        revisionId: revision.id,
        kind: 'general',
        body: comment.trim(),
      });
      await reviseCardDesign(projectId, card.number);
      toast.success(`Sent back. ${card.label} draws a new revision.`);
      setComment('');
      setCommenting(false);
    } catch (error) {
      showError(describeDesignError(error, projectId));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <InboxRow
      item={item}
      now={now}
      detail={
        revision
          ? `${revisions.length === 1 ? '1 variant' : `${revisions.length} variants`} · ${revision.title}`
          : 'The variants are still being read; open the design to see them.'
      }
      actions={
        commenting ? null : (
          <>
            <Link
              href={cardDesignHref(projectId, card.number)}
              className={buttonClassName({ variant: 'ghost', size: 'sm' })}
            >
              Open full preview
            </Link>
            {revision ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setCommenting(true)}
                >
                  Back with comment
                </Button>
                <Button
                  variant={offersApproveAndRun(card) ? 'glass' : 'solid'}
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  Approve
                </Button>
                {offersApproveAndRun(card) ? (
                  <Button
                    variant="solid"
                    size="sm"
                    disabled={busy}
                    onClick={() => void approveRun()}
                  >
                    Approve and run
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        )
      }
    >
      {revisions.length > 1 ? (
        <Select
          aria-label="Variant"
          value={revision?.id ?? ''}
          className="w-full sm:w-64"
          onChange={(e) => setVariant(e.target.value)}
        >
          {revisions.map((r) => (
            <option key={r.id} value={r.id}>
              Variant {r.variant}: {r.title}
            </option>
          ))}
        </Select>
      ) : null}
      {revision && frame ? (
        <DesignPreview
          src={frame.htmlUrl}
          title={`Mockup: ${revision.title} · ${frame.name}`}
        />
      ) : null}
      {commenting ? (
        <form className="flex flex-col gap-2" onSubmit={sendBack}>
          <Field label="What should change" htmlFor={commentId}>
            <Textarea
              id={commentId}
              value={comment}
              autoFocus
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="glass"
              size="sm"
              disabled={busy || !comment.trim()}
            >
              {busy ? 'Sending…' : 'Send back'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setCommenting(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(false);
        }}
        title={`Approve variant ${revision?.variant ?? ''} of ${card.label}?`}
        consequence={approveConsequence(card.continueAfterDesign)}
        verb="Approve"
        busy={busy}
        onConfirm={() => void approve()}
      />
    </InboxRow>
  );
}

/** A card that needs a person: why, Retry when there is one, and Open. */
export function FailedRow({
  item,
  now,
  actions,
}: {
  item: InboxFailedItem;
  now: number;
  actions: CardActions;
}) {
  const { card, retry } = item;
  return (
    <InboxRow
      item={item}
      now={now}
      detail={
        <span className="flex flex-col gap-0.5">
          <span>{failedReasonText(item)}</span>
          {item.message ? (
            <span className="line-clamp-3 break-words text-ink-3">
              {item.message}
            </span>
          ) : null}
        </span>
      }
      actions={
        <>
          <Link
            href={boardCardHref(item.projectId, card.number)}
            className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          >
            Open
          </Link>
          {retry ? (
            <Button
              variant="solid"
              size="sm"
              disabled={actions.busy}
              onClick={() =>
                void (retry === 'collect'
                  ? actions.createPullRequest(card)
                  : actions.run(card))
              }
            >
              {retry === 'collect' ? 'Push again' : 'Retry'}
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/** A project blocker: what stops its cards and the page that fixes it. */
export function SetupRow({
  item,
  now,
  isAdmin,
}: {
  item: InboxSetupItem;
  now: number;
  isAdmin: boolean;
}) {
  const copy = readinessCopy(item.blocker, {
    isAdmin,
    projectId: item.projectId,
    suggestion: null,
  });
  return (
    <InboxRow
      item={item}
      now={now}
      detail={copy.text}
      actions={
        copy.href && copy.cta ? (
          <Link
            href={copy.href}
            className={buttonClassName({ variant: 'solid', size: 'sm' })}
          >
            {copy.cta}
          </Link>
        ) : null
      }
    />
  );
}
