'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Field, Input, Select, Textarea } from '@andrewbehma/glass-ui/field';
import {
  BOARD_CARD_TITLE_MAX,
  type BoardCardView,
  type ProjectMemberView,
  TASK_CHECKLIST_MAX,
  TASK_CHECKLIST_TEXT_MAX,
} from '@nautelle/shared';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { createCard } from '../../lib/board/actions';
import { describeBoardError } from '../../lib/board/format';
import { checklistLines } from '../../lib/board/task';
import { useCurrentUser } from '../shell/user-context';

/** An option of the assignee select: the person and what to call them. */
export interface AssigneeOption {
  id: string;
  name: string;
}

const memberName = (member: Pick<ProjectMemberView, 'name' | 'email'>) =>
  member.name ?? member.email;

/**
 * The assignees a task may take: the caller first (the default), then the
 * project's other members. An admin who is no member is listed only as the
 * caller — the members route does not name them.
 */
export function assigneeOptions(
  me: { id: string; name: string | null; email: string },
  members: readonly ProjectMemberView[],
): AssigneeOption[] {
  const others = members
    .filter((m) => m.userId !== me.id)
    .map((m) => ({ id: m.userId, name: memberName(m) }));
  return [{ id: me.id, name: memberName(me) }, ...others];
}

/**
 * C-510 (ADR-0127): the Task side of the new-card dialog — title, description,
 * an assignee (default: you) and one checklist item per line. It lands in To
 * Do like any card; a task is never run.
 */
export function NewTaskForm({
  projectId,
  open,
  onCancel,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onCancel: () => void;
  onCreated: (card: BoardCardView) => void;
}) {
  const me = useCurrentUser();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assigneeId, setAssigneeId] = useState(me.id);
  const [checklist, setChecklist] = useState('');
  const [members, setMembers] = useState<ProjectMemberView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setBody('');
    setChecklist('');
    setAssigneeId(me.id);
    setError(undefined);
    let cancelled = false;
    api<ProjectMemberView[]>(
      `/projects/${encodeURIComponent(projectId)}/members`,
    )
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        // The select still offers the caller.
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, me.id]);

  const items = checklistLines(checklist);
  const tooMany = items.length > TASK_CHECKLIST_MAX;
  const tooLong = items.some((item) => item.length > TASK_CHECKLIST_TEXT_MAX);
  const valid = title.trim() !== '' && !tooMany && !tooLong && !busy;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      const card = await createCard(projectId, {
        title: title.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
        kind: 'task',
        assigneeId,
        ...(items.length > 0 ? { checklist: items } : {}),
      });
      onCreated(card);
    } catch (err) {
      setError(describeBoardError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Task title" htmlFor="new-task-title">
        <Input
          id="new-task-title"
          autoFocus
          value={title}
          maxLength={BOARD_CARD_TITLE_MAX}
          disabled={busy}
          placeholder="Add the Stripe secret to staging"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Task description" htmlFor="new-task-body">
        <Textarea
          id="new-task-body"
          rows={4}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Field
        label="Assignee"
        htmlFor="new-task-assignee"
        hint="The person who does it. Cards that wait on this task say whom."
      >
        <Select
          id="new-task-assignee"
          value={assigneeId}
          disabled={busy}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          {assigneeOptions(me, members).map((option) => (
            <option key={option.id} value={option.id}>
              {option.id === me.id ? `${option.name} (you)` : option.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Checklist"
        htmlFor="new-task-checklist"
        hint={
          tooMany
            ? `At most ${TASK_CHECKLIST_MAX} items.`
            : tooLong
              ? `Each item is at most ${TASK_CHECKLIST_TEXT_MAX} characters.`
              : 'Optional. One item per line.'
        }
      >
        <Textarea
          id="new-task-checklist"
          rows={4}
          value={checklist}
          disabled={busy}
          onChange={(e) => setChecklist(e.target.value)}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="glass" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {busy ? 'Saving…' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
