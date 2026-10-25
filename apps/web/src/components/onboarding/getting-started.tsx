'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { CodeBlock } from '@andrewbehma/glass-ui/code-block';
import { Progress } from '@andrewbehma/glass-ui/progress';
import type { PushCheckRequest, PushCheckView } from '@nautelle/shared';
import { Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { api, describeError } from '../../lib/api';
import type { RunnersFact } from '../../lib/prerequisites/facts';
import {
  PROFILES_LIST_COMMAND,
  SETUP_CLAUDE_COMMAND,
} from '../../lib/runners/install';
import {
  InstallCommands,
  InstallGuideLink,
  KeepOnlineCommands,
} from './runner-commands';
import {
  currentStep,
  GETTING_STARTED_ID,
  type GettingStarted as State,
  type Step,
} from './steps';

/**
 * C-396: runs `git push --dry-run` in the first project's checkout through its
 * runner and shows what came back; the step ticks once a check passes.
 */
function PushCheck({
  state,
  onChange,
}: {
  state: State;
  onChange: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PushCheckView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = state.project;
  if (!project) return <p>Connect a project first.</p>;
  const shown = result ?? state.pushCheck;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const body: PushCheckRequest = {
        runnerId: project.runnerId,
        path: project.rootPath,
      };
      setResult(
        await api<PushCheckView>('/admin/projects/push-check', {
          method: 'POST',
          body,
        }),
      );
      onChange();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <p>
        Agents push their branches to <code>origin</code>. The check runs{' '}
        <code>git push --dry-run</code> in {project.rootPath} on its runner, so
        nothing is pushed.
      </p>
      {shown ? (
        <p className={shown.ok ? 'text-ok' : 'text-danger'} role="status">
          {shown.message}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          variant="solid"
          size="sm"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? 'Checking…' : 'Run push check'}
        </Button>
      </div>
    </>
  );
}

/** What to do for the step the checklist is on. */
function StepBody({
  step,
  state,
  runners,
  onChange,
}: {
  step: Step;
  state: State;
  runners: RunnersFact;
  onChange: () => void;
}) {
  switch (step.id) {
    case 'install':
      return (
        <>
          <p>
            The runner is the Nautelle daemon. It runs agents and reads the
            repositories on its machine. Install it with one of:
          </p>
          <InstallCommands />
          <InstallGuideLink />
        </>
      );
    case 'pair': {
      if (runners.kind !== 'offline') {
        return (
          <p>
            Add a runner on the Runners page and run the pairing command it
            shows on that machine. The code works once and expires after 10
            minutes.
          </p>
        );
      }
      const idle = runners.runners;
      return (
        <>
          <p>
            {idle.length > 0
              ? `${idle.map((runner) => runner.name).join(', ')} ${idle.length === 1 ? 'is' : 'are'} paired but not running. Start it on that machine:`
              : 'Start the runner on its machine:'}
          </p>
          <KeepOnlineCommands />
          <InstallGuideLink />
        </>
      );
    }
    case 'project':
      return (
        <p>
          Pick a GitHub repository the runner found under its allowed folders.
          Nautelle inspects it, picks the base branch and checks that it can
          push before anything is stored.
        </p>
      );
    case 'profile':
      return (
        <p>
          A runtime profile is the Claude Code or Codex setup agents start with
          on the runner. Pick the project&apos;s default in its settings.
        </p>
      );
    case 'plugin':
      return (
        <>
          <p>
            The Claude Code plugin reports sessions and asks for approvals
            through Nautelle. On the runner&apos;s machine, list the profiles
            and install it into the one agents use:
          </p>
          <CodeBlock code={PROFILES_LIST_COMMAND} language="shell" />
          <CodeBlock code={SETUP_CLAUDE_COMMAND} language="shell" />
        </>
      );
    case 'push':
      return <PushCheck state={state} onChange={onChange} />;
    case 'card':
      return (
        <p>
          Add a card on the Board with what you want done and run it. An agent
          works in its own worktree and opens a pull request for you to review
          and merge.
        </p>
      );
    default:
      return null;
  }
}

function StepRow({
  step,
  number,
  open,
  children,
}: {
  step: Step;
  number?: number;
  open: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {step.done ? (
          <Check className="size-4 text-ok" />
        ) : (
          <Circle className="size-4 text-ink-3" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={
              step.done
                ? 'text-sm text-ink-3 line-through'
                : open
                  ? 'text-sm font-medium'
                  : 'text-sm'
            }
          >
            {number ? `${number}. ` : ''}
            {step.title}
            <span className="sr-only">
              {step.done ? ' — done' : ' — to do'}
            </span>
          </span>
          {!step.done && step.href && step.cta ? (
            <Link
              href={step.href}
              className={buttonClassName({
                variant: open ? 'solid' : 'glass',
                size: 'sm',
              })}
            >
              {step.cta}
            </Link>
          ) : null}
        </div>
        {open && children ? (
          <div className="flex flex-col gap-2 text-sm text-ink-2">
            {children}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Getting started (issue #132, C-396): the first-run steps for an admin, with the
 * commands for the step they are on. The caller hides it once `complete`.
 */
export function GettingStarted({
  state,
  runners,
  onChange,
}: {
  state: State;
  runners: RunnersFact;
  /** A step was done here: look at the facts again. */
  onChange: () => void;
}) {
  const current = currentStep(state);
  const required = state.steps.filter((step) => !step.optional);
  const optional = state.steps.filter((step) => step.optional);

  return (
    <Card
      id={GETTING_STARTED_ID}
      pad="lg"
      className="flex scroll-mt-4 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Getting started</h2>
        <p className="text-sm text-ink-2">
          Nautelle drives agents on your own machines. These steps take you to a
          first card with a pull request.
        </p>
      </div>
      <Progress
        value={state.done}
        max={state.total}
        label={`${state.done} of ${state.total}`}
        tone={state.complete ? 'ok' : 'neutral'}
      />
      <ol className="flex flex-col gap-4">
        {required.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            number={index + 1}
            open={step.id === current?.id}
          >
            <StepBody
              step={step}
              state={state}
              runners={runners}
              onChange={onChange}
            />
          </StepRow>
        ))}
      </ol>
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Optional</h3>
        <ul className="flex flex-col gap-3">
          {optional.map((step) => (
            <StepRow key={step.id} step={step} open={false} />
          ))}
        </ul>
      </div>
    </Card>
  );
}
