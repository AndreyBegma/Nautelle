'use client';

import { Avatar } from '@andrewbehma/glass-ui/avatar';
import { Banner } from '@andrewbehma/glass-ui/banner';
import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Checkbox } from '@andrewbehma/glass-ui/checkbox';
import { Input, Select, Textarea } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { SheetContent } from '@andrewbehma/glass-ui/sheet';
import { StatusPill } from '@andrewbehma/glass-ui/status-pill';
import { toast } from '@andrewbehma/glass-ui/toast';
import {
  type BoardCardDetail,
  type BoardCardView,
  type ProjectMemberView,
  TASK_CHECKLIST_TEXT_MAX,
  TASK_NOTE_MAX,
} from '@nautelle/shared';
import { ExternalLink } from 'lucide-react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  addTaskItem,
  doneTask,
  fetchBoard,
  removeTaskItem,
  reopenTask,
  updateCard,
  updateTaskItem,
} from '../../lib/board/actions';
import { dependencyName } from '../../lib/board/dependencies';
import { COLUMN_TITLE, describeBoardError } from '../../lib/board/format';
import { boardCardPageHref } from '../../lib/board/href';
import {
  doneConfirmText,
  taskLine,
  taskProgress,
  unticked,
} from '../../lib/board/task';
import { Time } from '../../lib/format/time';
import { PageHeader } from '../page-header/page-header';
import { useNarrow } from '../shell/narrow';
import { useCurrentUser } from '../shell/user-context';
import { cardSheetFooter, cardSheetSide, InitialFocus } from './card-sheet';
import { assigneeOptions } from './new-task-form';

/** The cards of the project that wait on card `number`, from the Board. */
function useDependants(projectId: string, number: number, refresh: unknown) {
  const [waiting, setWaiting] = useState<BoardCardView[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is a refetch trigger
  useEffect(() => {
    let cancelled = false;
    fetchBoard(projectId)
      .then((board) => {
        if (cancelled) return;
        setWaiting(
          board.columns
            .flatMap((column) => column.cards)
            .filter((c) => c.dependsOn?.some((d) => d.number === number)),
        );
      })
      .catch(() => {
        // The list is a courtesy; the task works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, number, refresh]);
  return waiting;
}

/**
 * C-510 (ADR-0127): a task's sheet — status, who has it, the checklist, what
 * waits on it and Done. No rounds, session or pull-request tabs: a task has
 * none. It is the body of both the Board's sheet and the card page.
 */
export function TaskSheetBody({
  layout = 'sheet',
  sheetTitle,
  projectId,
  card,
  canOperate,
  onSaved,
  onClose,
}: {
  layout?: 'sheet' | 'page';
  sheetTitle: string;
  projectId: string;
  card: BoardCardDetail;
  canOperate: boolean;
  onSaved: () => void;
  onClose?: () => void;
}) {
  const narrow = useNarrow();
  const me = useCurrentUser();
  const items = card.checklistItems ?? [];
  const completed = card.column === 'completed';
  const mine = card.assignee?.id === me.id;
  const canTick = canOperate || mine;
  const open = unticked(items);
  const waiting = useDependants(projectId, card.number, card);
  const [members, setMembers] = useState<ProjectMemberView[]>([]);
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const progress = taskProgress(card);
  const pageHref = boardCardPageHref(projectId, card.number);

  useEffect(() => {
    if (!canOperate) return;
    let cancelled = false;
    api<ProjectMemberView[]>(
      `/projects/${encodeURIComponent(projectId)}/members`,
    )
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        // Without the list the assignee is shown, not changed.
      });
    return () => {
      cancelled = true;
    };
  }, [canOperate, projectId]);

  const run = async (work: () => Promise<unknown>, after?: string) => {
    setBusy(true);
    try {
      await work();
      if (after) toast.success(after);
      onSaved();
    } catch (err) {
      toast.error(describeBoardError(err));
    } finally {
      setBusy(false);
    }
  };

  const markDone = () =>
    run(async () => {
      await doneTask(projectId, card.number, {
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setConfirming(false);
      setNote('');
    }, `${card.label} is done.`);

  const doneButton = completed ? (
    canTick ? (
      <Button
        variant="glass"
        disabled={busy}
        onClick={() =>
          run(
            () => reopenTask(projectId, card.number),
            `${card.label} is open.`,
          )
        }
      >
        Reopen
      </Button>
    ) : undefined
  ) : canTick ? (
    <Button
      data-task-done=""
      disabled={busy}
      onClick={() => (open > 0 ? setConfirming(true) : void markDone())}
    >
      Done
    </Button>
  ) : undefined;

  const options = assigneeOptions(me, members);
  if (card.assignee && !options.some((o) => o.id === card.assignee?.id)) {
    options.push({ id: card.assignee.id, name: card.assignee.name });
  }

  const body = (
    <div className="flex min-w-0 flex-col gap-5" data-task-sheet="">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <StatusPill
          size="sm"
          status={
            completed
              ? 'idle'
              : card.column === 'in_progress'
                ? 'running'
                : 'waiting'
          }
          label={COLUMN_TITLE[card.column]}
        />
        <span className="text-ink-2">{taskLine(card)}</span>
      </div>

      {card.body ? (
        <p className="whitespace-pre-wrap break-words text-sm">{card.body}</p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-3">Assignee</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {card.assignee ? (
            <Avatar size="sm" name={card.assignee.name} className="size-5" />
          ) : null}
          {canOperate && !completed ? (
            <Select
              aria-label="Assignee"
              value={card.assignee?.id ?? ''}
              disabled={busy}
              onChange={(e) =>
                void run(
                  () =>
                    updateCard(projectId, card.number, {
                      assigneeId: e.target.value,
                    }),
                  'Assignee changed.',
                )
              }
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          ) : (
            <span>{card.assignee?.name ?? 'Nobody'}</span>
          )}
        </dd>
        {card.raisedFor ? (
          <>
            <dt className="text-ink-3">Raised by</dt>
            <dd data-task-raised="">Raised by {card.raisedFor.label}</dd>
          </>
        ) : null}
        <dt className="text-ink-3">Created</dt>
        <dd>
          <Time value={card.createdAt} />
        </dd>
      </dl>

      {waiting.length > 0 && !completed ? (
        <Banner tone="info">
          Done releases {waiting.length === 1 ? 'the card' : 'the cards'}{' '}
          waiting on it.
        </Banner>
      ) : null}

      {completed && card.taskNote ? (
        <p className="whitespace-pre-wrap break-words text-sm text-ink-2">
          {card.taskNote}
        </p>
      ) : null}

      <section aria-label="Checklist" className="flex flex-col gap-2">
        <SectionHeader
          title={progress ? `Checklist · ${progress}` : 'Checklist'}
          headingLevel={3}
        />
        {items.length === 0 ? (
          <p className="text-sm text-ink-3">No items.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <Checkbox
                  label={item.text}
                  checked={item.doneAt !== null}
                  disabled={busy || !canTick || completed}
                  onChange={(e) =>
                    void run(() =>
                      updateTaskItem(projectId, card.number, item.id, {
                        done: e.target.checked,
                      }),
                    )
                  }
                />
                {canOperate && !completed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    aria-label={`Remove ${item.text}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        removeTaskItem(projectId, card.number, item.id),
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canOperate && !completed ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = newItem.trim();
              if (!text) return;
              void run(async () => {
                await addTaskItem(projectId, card.number, { text });
                setNewItem('');
              });
            }}
          >
            <Input
              aria-label="New checklist item"
              placeholder="Add an item"
              value={newItem}
              maxLength={TASK_CHECKLIST_TEXT_MAX}
              disabled={busy}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <Button
              type="submit"
              variant="glass"
              disabled={busy || newItem.trim() === ''}
            >
              Add
            </Button>
          </form>
        ) : null}
      </section>

      <section
        aria-label="Waiting on this task"
        className="flex flex-col gap-2"
      >
        <SectionHeader title="Unblocks" headingLevel={3} />
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing waits on this task.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm" data-task-unblocks="">
            {waiting.map((c) => {
              const dep = c.dependsOn?.find((d) => d.number === card.number);
              return (
                <li key={c.id}>
                  <NextLink
                    href={boardCardPageHref(projectId, c.number)}
                    className="underline-offset-2 hover:underline"
                  >
                    {c.label} {c.title}
                  </NextLink>
                  <span className="text-ink-3">
                    {' '}
                    · waits for {dep ? dependencyName(dep) : card.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirming ? (
        <div className="flex flex-col gap-2" data-task-confirm="">
          <Banner tone="warn">{doneConfirmText(open)}</Banner>
          <Textarea
            aria-label="Note"
            rows={2}
            placeholder="Optional note for the waiting session"
            value={note}
            maxLength={TASK_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="glass"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Not yet
            </Button>
            <Button disabled={busy} onClick={() => void markDone()}>
              Done anyway
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (layout === 'page') {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader
          className="mb-0"
          eyebrow={`Board card · ${card.label} · Task`}
          title={card.title}
          actions={doneButton}
        />
        <div className="max-w-2xl">{body}</div>
      </div>
    );
  }

  return (
    <SheetContent
      side={cardSheetSide(narrow)}
      title={sheetTitle}
      description="Task"
      footer={cardSheetFooter({
        narrow,
        actions: doneButton,
        pageHref,
        onClose,
      })}
    >
      <InitialFocus />
      {narrow ? null : (
        <NextLink
          href={pageHref}
          className={buttonClassName({
            variant: 'glass',
            size: 'sm',
            className: 'mb-3 ms-auto w-fit',
          })}
        >
          Open as page
          <ExternalLink aria-hidden="true" className="size-4" />
        </NextLink>
      )}
      {body}
    </SheetContent>
  );
}
