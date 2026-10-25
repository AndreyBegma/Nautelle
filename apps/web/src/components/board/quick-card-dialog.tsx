'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Checkbox } from '@andrewbehma/glass-ui/checkbox';
import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import { Field, Input, Select, Textarea } from '@andrewbehma/glass-ui/field';
import { toast } from '@andrewbehma/glass-ui/toast';
import {
  type AttachmentView,
  BOARD_CARD_KINDS,
  BOARD_CARD_TITLE_MAX,
  type BoardCardKind,
  cardLabel,
  type QuickCardDraft,
} from '@nautelle/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { describeUploadFailure } from '../../lib/attachments/format';
import { useAttachmentUploads } from '../../lib/attachments/use-attachment-uploads';
import { describeBoardError } from '../../lib/board/format';
import {
  draftQuickCard,
  draftWithin,
  mergeQuickDraft,
  QUICK_CARD_TEXT_MAX,
  QUICK_DRAFT_DEBOUNCE_MS,
  QUICK_DRAFT_MIN_CHARS,
  type QuickCardResult,
  quickCardReady,
  saveQuickCard,
} from '../../lib/board/quick-card';
import { AttachmentDropzone } from '../attachments/attachment-dropzone';
import { AttachmentList } from '../attachments/attachment-list';

const KIND_LABEL: Record<BoardCardKind, string> = {
  feature: 'Feature',
  bug: 'Bug',
};

/** What the toast says once the card is saved and Run now was or was not asked. */
export function quickCardToast({ card, run }: QuickCardResult): string {
  const label = cardLabel(card.number);
  switch (run.state) {
    case 'started':
      return `${label} is created and running.`;
    case 'waiting':
      return `${label} is in To Do, waiting for a slot. It starts when a worker is free.`;
    case 'refused':
      return `${label} is in To Do. It did not start: ${run.message}`;
    default:
      return `${label} is in To Do.`;
  }
}

/**
 * Quick card (C-391): one text field and attachments become a card in To Do in
 * one step. A cheap model suggests the title and kind while the person types;
 * both stay editable. Enter saves (Shift+Enter is a new line); **Run now**
 * starts the card as well. The interview stays the way for big work.
 */
export function QuickCardDialog({
  projectId,
  open,
  initialText,
  initialAttachments,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  /** Text carried over from New work. */
  initialText?: string;
  /** Files already uploaded in New work, claimed by this card. */
  initialAttachments?: readonly AttachmentView[];
  onOpenChange: (open: boolean) => void;
  onSaved?: (result: QuickCardResult) => void;
}) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<BoardCardKind>('feature');
  const [runNow, setRunNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string>();
  const [carried, setCarried] = useState<readonly AttachmentView[]>([]);
  const uploads = useAttachmentUploads(projectId);
  // A field the person wrote is theirs: a later suggestion does not replace it.
  const touched = useRef({ title: false, kind: false });
  const pending = useRef<{
    text: string;
    draft: Promise<QuickCardDraft | null>;
  } | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    if (!open) return;
    setText(initialText ?? '');
    setCarried(initialAttachments ?? []);
    setTitle('');
    setKind('feature');
    setRunNow(false);
    setError(undefined);
    touched.current = { title: false, kind: false };
    pending.current = null;
  }, [open, initialText, initialAttachments]);

  const suggest = (value: string): Promise<QuickCardDraft | null> => {
    const ticket = ++asked.current;
    setDrafting(true);
    const draft = draftQuickCard(projectId, value)
      .then((answer): QuickCardDraft | null => {
        if (ticket !== asked.current) return null;
        if (!touched.current.title) setTitle(answer.title);
        if (!touched.current.kind) setKind(answer.kind);
        return answer;
      })
      .catch(() => {
        // Best effort: the title falls back to the text's first line on save.
        return null;
      })
      .finally(() => {
        if (ticket === asked.current) setDrafting(false);
      });
    pending.current = { text: value, draft };
    return draft;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: suggest reads only refs and setters
  useEffect(() => {
    if (!open || touched.current.title) return;
    if (text.trim().length < QUICK_DRAFT_MIN_CHARS) return;
    const timer = setTimeout(() => {
      void suggest(text.trim());
    }, QUICK_DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, text, projectId]);

  const valid = quickCardReady({ text }, uploads.busy) && !busy;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      // A suggestion on its way, or one the debounce has not asked for yet, is
      // worth a moment (`QUICK_DRAFT_WAIT_MS`); past it, or on its failure, the
      // title is the text's first line. The fields below are the render's, so
      // the draft is merged in by hand rather than read back from state.
      const value = text.trim();
      const bothTouched = touched.current.title && touched.current.kind;
      let request = pending.current?.text === value ? pending.current : null;
      if (!request && !bothTouched && value.length >= QUICK_DRAFT_MIN_CHARS) {
        void suggest(value);
        request = pending.current;
      }
      const draft = request ? await draftWithin(request.draft) : null;
      const fields = mergeQuickDraft({ title, kind }, touched.current, draft);
      const result = await saveQuickCard(projectId, {
        text,
        ...fields,
        runNow,
        attachmentIds: [
          ...carried.map((a) => a.id),
          ...uploads.done.map((d) => d.view.id),
        ],
      });
      setCarried([]);
      uploads.forget(uploads.done.map((d) => d.item));
      toast.success(quickCardToast(result));
      onSaved?.(result);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.body?.error === 'attachment_error'
          ? describeUploadFailure(err.status, err.body)
          : describeBoardError(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Quick card"
        description="Say what to do. It lands in To Do as one card — no interview."
        className="sm:max-w-xl"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Quick card text" htmlFor="quick-card-text">
            <Textarea
              id="quick-card-text"
              rows={5}
              autoFocus
              value={text}
              maxLength={QUICK_CARD_TEXT_MAX}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          </Field>
          <section aria-label="Attachments" className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Attachments</span>
            <AttachmentList attachments={carried} canRemove={false} />
            <AttachmentDropzone
              uploads={uploads}
              label="Attach files for the card"
            />
          </section>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field
              label="Title"
              htmlFor="quick-card-title"
              hint={
                drafting
                  ? 'Writing a title…'
                  : 'Suggested from your text; edit it if it is off.'
              }
            >
              <Input
                id="quick-card-title"
                value={title}
                maxLength={BOARD_CARD_TITLE_MAX}
                disabled={busy}
                placeholder="First line of the text"
                onChange={(e) => {
                  touched.current.title = true;
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field label="Kind" htmlFor="quick-card-kind">
              <Select
                id="quick-card-kind"
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  touched.current.kind = true;
                  setKind(e.target.value as BoardCardKind);
                }}
              >
                {BOARD_CARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            label="Run now"
            hint="Starts the card now if a worker is free; otherwise it waits in the run queue for one."
            checked={runNow}
            disabled={busy}
            onChange={(e) => setRunNow(e.target.checked)}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="glass"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {busy ? 'Saving…' : runNow ? 'Create and run' : 'Create card'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
