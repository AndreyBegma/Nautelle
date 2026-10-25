'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { Field, Input } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from '@andrewbehma/glass-ui/table';
import { toast } from '@andrewbehma/glass-ui/toast';
import type {
  ProjectDetail,
  ToolRuleView,
  UpdateProjectRequest,
} from '@nautelle/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../../../lib/api';
import { Time } from '../../../../../lib/format/time';
import {
  describeToolRuleError,
  parseTimeoutMinutes,
  SCOPE_LABEL,
  sortToolRules,
  TIMEOUT_DEFAULT_TEXT,
  timeoutError,
} from '../../../../../lib/projects/away-mode';
import { describeProjectError } from '../../../../../lib/projects/format';
import { useErrorToast } from '../../../../../lib/section/use-error-toast';

/** How long a tool-use request waits for a person; an admin sets it. */
function TimeoutCard({
  project,
  isAdmin,
  onChanged,
}: {
  project: ProjectDetail;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const saved = project.toolUseTimeoutMinutes;
  const [text, setText] = useState(saved === null ? '' : String(saved));
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();

  // Reset the form when the project reloads (a save, a live frame).
  useEffect(() => {
    setText(saved === null ? '' : String(saved));
  }, [saved]);

  const parsed = parseTimeoutMinutes(text);
  const dirty = parsed !== undefined && parsed !== saved;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (parsed === undefined) return;
    setBusy(true);
    const body: UpdateProjectRequest = { toolUseTimeoutMinutes: parsed };
    try {
      await api(`/projects/${project.id}`, { method: 'PATCH', body });
      toast.success('Request timeout saved');
      onChanged();
    } catch (err) {
      showError(describeProjectError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card pad="lg" className="flex flex-col gap-4">
      <SectionHeader
        title="Request timeout"
        description="How long a tool call asked in away mode waits for an answer. The session waits the whole time; only after it does Claude Code show its own dialog."
      />
      <form className="flex flex-col gap-4" onSubmit={save}>
        <Field
          label="Timeout (minutes)"
          htmlFor="project-tool-use-timeout"
          hint={TIMEOUT_DEFAULT_TEXT}
          error={isAdmin ? timeoutError(text) : undefined}
        >
          <Input
            id="project-tool-use-timeout"
            inputMode="numeric"
            placeholder="Not set"
            value={text}
            disabled={!isAdmin}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        {isAdmin ? (
          <div className="flex justify-end gap-2">
            <Button variant="solid" type="submit" disabled={busy || !dirty}>
              Save
            </Button>
          </div>
        ) : (
          <p className="text-ink-3 text-sm">
            Only administrators can change the timeout.
          </p>
        )}
      </form>
    </Card>
  );
}

/** The remembered rules of the project; an operator removes one. */
function RulesCard({
  projectId,
  canOperate,
}: {
  projectId: string;
  canOperate: boolean;
}) {
  const [rules, setRules] = useState<ToolRuleView[]>();
  const [removing, setRemoving] = useState<ToolRuleView>();
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();

  const load = useCallback(async () => {
    try {
      setRules(
        sortToolRules(
          await api<ToolRuleView[]>(`/projects/${projectId}/tool-rules`),
        ),
      );
    } catch (err) {
      showError(describeToolRuleError(err));
    }
  }, [projectId, showError]);

  useEffect(() => {
    if (canOperate) void load();
  }, [canOperate, load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/projects/${projectId}/tool-rules/${removing.id}`, {
        method: 'DELETE',
      });
      toast.success('Rule removed');
    } catch (err) {
      showError(describeToolRuleError(err));
    } finally {
      setBusy(false);
      setRemoving(undefined);
      void load();
    }
  };

  return (
    <Card pad="lg" className="flex flex-col gap-4">
      <SectionHeader
        title="Allowed tool calls"
        description="Rules made by “Allow similar in this session” and “Always allow in this project”. A call a rule covers is approved without asking and written to the audit log. Deleting files, pushing to a protected branch and reading secrets always ask."
      />
      {!canOperate ? (
        <p className="text-ink-3 text-sm">
          Only operators of this project can see and remove the rules.
        </p>
      ) : rules && rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Approve a tool call in away mode with “Allow similar” or “Always allow” to add one."
        />
      ) : (
        <Table scroll>
          <TableHead>
            <TableRow>
              <TableCell head>Rule</TableCell>
              <TableCell head>Scope</TableCell>
              <TableCell head>Used</TableCell>
              <TableCell head>Added</TableCell>
              <TableCell head>
                <span className="sr-only">Actions</span>
              </TableCell>
            </TableRow>
          </TableHead>
          <tbody>
            {(rules ?? []).map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <code className="font-mono text-xs break-all">
                    {rule.label}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge
                    tone={rule.scope === 'project' ? 'warn' : 'neutral'}
                    label={SCOPE_LABEL[rule.scope]}
                  />
                </TableCell>
                <TableCell>
                  <span className="num">{rule.useCount}</span>
                  {rule.lastUsedAt ? (
                    <span className="text-ink-3 text-xs">
                      {' '}
                      · last <Time value={rule.lastUsedAt} />
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Time value={rule.createdAt} />
                  {rule.createdByEmail ? (
                    <span className="text-ink-3 text-xs">
                      {' '}
                      by {rule.createdByEmail}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove the rule ${rule.label}`}
                      onClick={() => setRemoving(rule)}
                    >
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={`Remove the rule ${removing?.label ?? ''}?`}
        consequence="Calls it covered ask a person again. The removal is written to the audit log."
        verb="Remove"
        tone="danger"
        busy={busy}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}

/**
 * Project settings → Away mode (C-401): how long a tool call waits for a
 * person, and the rules that answer similar calls without asking.
 */
export function AwayTab({
  project,
  isAdmin,
  canOperate,
  onChanged,
}: {
  project: ProjectDetail;
  isAdmin: boolean;
  canOperate: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TimeoutCard project={project} isAdmin={isAdmin} onChanged={onChanged} />
      <RulesCard projectId={project.id} canOperate={canOperate} />
    </div>
  );
}
