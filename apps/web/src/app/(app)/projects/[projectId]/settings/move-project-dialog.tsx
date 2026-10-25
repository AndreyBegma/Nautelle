'use client';

import { Banner } from '@andrewbehma/glass-ui/banner';
import { Button } from '@andrewbehma/glass-ui/button';
import { CodeBlock } from '@andrewbehma/glass-ui/code-block';
import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import { Field, Input, Select } from '@andrewbehma/glass-ui/field';
import { toast } from '@andrewbehma/glass-ui/toast';
import type {
  AdminRunner,
  AdminRunnerDetail,
  AdminRuntimeProfile,
  InspectProjectRequest,
  MoveProjectRequest,
  ProjectDetail,
  ProjectMoveCheck,
  ProjectMoveResult,
} from '@nautelle/shared';
import type { ProjectInspection } from '@nautelle/shared/protocol';
import { type FormEvent, useEffect, useState } from 'react';
import { DisabledReason } from '../../../../../components/prerequisites/disabled-reason';
import { api } from '../../../../../lib/api';
import { isRunnerOnline } from '../../../../../lib/prerequisites/facts';
import {
  describeProjectError,
  moveBlocker,
  suggestedPathOf,
  worktreeRemoveCommand,
} from '../../../../../lib/projects/format';

const REASON_ID = 'move-project-reason';

/** What the move left on the old machine, with the commands that remove it. */
function OldWorktrees({ result }: { result: ProjectMoveResult }) {
  if (result.worktrees.length === 0) {
    return (
      <p className="text-ink-2 text-sm">
        No worktrees were left on {result.from.runnerName}.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-2 text-sm">
        These worktrees stay on {result.from.runnerName}. Nautelle does not
        touch that machine; remove them there when you no longer need them.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {result.worktrees.map((worktree) => (
          <li key={worktree.path}>
            <span className="font-medium">{worktree.label}</span>
            {worktree.branch ? (
              <span className="text-ink-3"> · {worktree.branch}</span>
            ) : null}
            <span className="block font-mono text-xs break-all">
              {worktree.path}
            </span>
          </li>
        ))}
      </ul>
      <CodeBlock
        code={result.worktrees
          .map((worktree) =>
            worktreeRemoveCommand(result.from.rootPath, worktree.path),
          )
          .join('\n')}
      />
    </div>
  );
}

/**
 * C-400 (ADR-0101): moves the project to another paired runner and its main
 * checkout there, re-choosing the runtime profile from that runner's.
 */
export function MoveProjectDialog({
  project,
  currentProfileKey,
  open,
  onClose,
  onMoved,
}: {
  project: ProjectDetail;
  /** The key of the current default profile, preselected on the target. */
  currentProfileKey: string | null;
  open: boolean;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [runners, setRunners] = useState<AdminRunner[]>([]);
  const [check, setCheck] = useState<ProjectMoveCheck>();
  const [runnerId, setRunnerId] = useState('');
  const [path, setPath] = useState('');
  const [inspection, setInspection] = useState<ProjectInspection>();
  const [profiles, setProfiles] = useState<AdminRuntimeProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState<string>();
  const [suggested, setSuggested] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProjectMoveResult>();

  useEffect(() => {
    if (!open) return;
    setPath('');
    setInspection(undefined);
    setError(undefined);
    setSuggested(undefined);
    setResult(undefined);
    setCheck(undefined);
    let current = true;
    api<AdminRunner[]>('/admin/runners')
      .then((list) => {
        if (!current) return;
        const others = list.filter(
          (runner) =>
            runner.id !== project.runnerId && isRunnerOnline(runner.status),
        );
        setRunners(others);
        setRunnerId((selected) =>
          others.some((runner) => runner.id === selected)
            ? selected
            : (others[0]?.id ?? ''),
        );
      })
      .catch((err) => {
        if (current) toast.error(describeProjectError(err));
      });
    api<ProjectMoveCheck>(`/projects/${project.id}/move`)
      .then((found) => {
        if (current) setCheck(found);
      })
      .catch((err) => {
        if (current) toast.error(describeProjectError(err));
      });
    return () => {
      current = false;
    };
  }, [open, project.id, project.runnerId]);

  // The profile is re-chosen from the target runner's; the same key is preselected.
  useEffect(() => {
    setProfiles([]);
    setProfileId('');
    if (!open || !runnerId) return;
    let current = true;
    api<AdminRunnerDetail>(`/admin/runners/${runnerId}`)
      .then((runner) => {
        if (!current) return;
        const usable = runner.profiles.filter((p) => !p.missing);
        setProfiles(usable);
        setProfileId(usable.find((p) => p.key === currentProfileKey)?.id ?? '');
      })
      .catch((err) => {
        if (current) toast.error(describeProjectError(err));
      });
    return () => {
      current = false;
    };
  }, [open, runnerId, currentProfileKey]);

  const selected = runners.find((runner) => runner.id === runnerId);
  const running = check?.running ?? [];
  const blocker = inspection ? moveBlocker(inspection, project.repo) : null;

  const inspect = async (event?: FormEvent, usePath = path) => {
    event?.preventDefault();
    const trimmed = usePath.trim();
    if (!runnerId || !trimmed) return;
    setBusy(true);
    setError(undefined);
    setSuggested(undefined);
    setInspection(undefined);
    try {
      const body: InspectProjectRequest = { runnerId, path: trimmed };
      setInspection(
        await api<ProjectInspection>('/admin/projects/inspect', {
          method: 'POST',
          body,
        }),
      );
    } catch (err) {
      setError(describeProjectError(err));
      setSuggested(suggestedPathOf(err));
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!inspection) return;
    setBusy(true);
    setError(undefined);
    try {
      const body: MoveProjectRequest = {
        runnerId,
        path: inspection.root,
        defaultProfileId: profileId || null,
      };
      const moved = await api<ProjectMoveResult>(
        `/projects/${project.id}/move`,
        { method: 'POST', body },
      );
      setResult(moved);
      toast.success(
        `${project.displayName} now runs on ${moved.project.runnerName}.`,
      );
      onMoved();
    } catch (err) {
      setError(describeProjectError(err));
      setSuggested(suggestedPathOf(err));
      setInspection(undefined);
    } finally {
      setBusy(false);
    }
  };

  const canInspect = runnerId !== '' && path.trim() !== '';
  // Rule R1: a reason for each disabled button that is not just "busy".
  const reason = busy
    ? null
    : running.length > 0
      ? 'Stop what runs first; the move waits for it.'
      : runners.length === 0
        ? 'No other runner is online. Pair or start one first.'
        : !canInspect
          ? 'Pick a runner and enter a path, then Inspect.'
          : !inspection
            ? 'Inspect the path first; Move uses what it finds.'
            : null;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={result ? 'Project moved' : 'Move to another runner'}
        description={
          result
            ? `${project.displayName} runs on ${result.project.runnerName} at ${result.project.rootPath}. Cards keep their history; their next rounds start fresh sessions there.`
            : `${project.displayName} runs on ${project.runnerName} at ${project.rootPath}. Pick the runner and the path of the repository's main checkout on it.`
        }
        footer={
          result ? (
            <Button variant="solid" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="glass"
                type="submit"
                form="move-project-inspect"
                disabled={busy || !canInspect}
                aria-describedby={reason ? REASON_ID : undefined}
              >
                Inspect
              </Button>
              <Button
                variant="solid"
                onClick={() => void move()}
                disabled={
                  busy || !inspection || blocker !== null || running.length > 0
                }
                aria-describedby={reason ? REASON_ID : undefined}
              >
                Move
              </Button>
            </>
          )
        }
      >
        {result ? (
          <OldWorktrees result={result} />
        ) : (
          <div className="flex flex-col gap-4">
            {running.length > 0 ? (
              <Banner tone="warn" title="Work is running on this project">
                Stop it before the move: {running.join(', ')}.
              </Banner>
            ) : null}
            <form
              id="move-project-inspect"
              className="flex flex-col gap-3"
              onSubmit={inspect}
            >
              <Field label="Runner" htmlFor="move-runner" required>
                <Select
                  id="move-runner"
                  value={runnerId}
                  disabled={runners.length === 0}
                  onChange={(e) => {
                    setRunnerId(e.target.value);
                    setInspection(undefined);
                  }}
                >
                  {runners.length === 0 ? (
                    <option value="">No other online runner</option>
                  ) : null}
                  {runners.map((runner) => (
                    <option key={runner.id} value={runner.id}>
                      {runner.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Path"
                htmlFor="move-path"
                required
                hint={`Absolute path to a clone of ${project.repo} on ${selected?.hostname ?? selected?.name ?? "the runner's machine"}.`}
              >
                <Input
                  id="move-path"
                  value={path}
                  placeholder="/home/you/dev/my-repo"
                  onChange={(e) => {
                    setPath(e.target.value);
                    setInspection(undefined);
                  }}
                />
              </Field>
              <Field
                label="Default runtime profile"
                htmlFor="move-profile"
                hint={`Profiles of ${selected?.name ?? 'the target runner'}. The orchestrator's profile is cleared; choose it again in Orchestrator settings.`}
              >
                <Select
                  id="move-profile"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                >
                  <option value="">None</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label} ({profile.runtime})
                    </option>
                  ))}
                </Select>
              </Field>
            </form>

            {error ? (
              <div
                role="alert"
                className="text-danger flex flex-col gap-2 text-sm"
              >
                <span>{error}</span>
                {suggested ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono break-all">{suggested}</span>
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => {
                        setPath(suggested);
                        void inspect(undefined, suggested);
                      }}
                    >
                      Use this path
                    </Button>
                  </span>
                ) : null}
              </div>
            ) : null}

            {inspection ? (
              blocker ? (
                <div role="alert" className="text-danger text-sm">
                  {blocker}
                </div>
              ) : (
                <p className="text-sm">
                  <span className="font-mono break-all">{inspection.root}</span>{' '}
                  <span className="text-ink-2">
                    is a main checkout of {inspection.remote.repo} on{' '}
                    {inspection.baseBranch}.
                  </span>
                </p>
              )
            ) : null}

            {check && check.worktrees.length > 0 ? (
              <p className="text-ink-3 text-xs">
                {check.worktrees.length === 1
                  ? '1 worktree stays'
                  : `${check.worktrees.length} worktrees stay`}{' '}
                on {project.runnerName}; the commands to remove them follow the
                move.
              </p>
            ) : null}

            {reason ? (
              <div className="flex justify-end">
                <DisabledReason id={REASON_ID}>{reason}</DisabledReason>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
