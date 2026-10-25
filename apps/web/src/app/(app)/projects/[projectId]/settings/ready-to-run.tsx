'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Section } from '@andrewbehma/glass-ui/section';
import type {
  DemoSettingsView,
  ProjectDetail,
  PushCheckRequest,
  TerminalSetupView,
} from '@nautelle/shared';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { useCurrentUser } from '../../../../../components/shell/user-context';
import { api } from '../../../../../lib/api';
import { describeProjectError } from '../../../../../lib/projects/format';
import {
  type ReadyState,
  readyChecks,
  readySummary,
} from '../../../../../lib/projects/ready-to-run';
import { useReadiness } from '../../../../../lib/readiness/use-readiness';
import { useErrorToast } from '../../../../../lib/section/use-error-toast';
import { useSection } from '../../../../../lib/section/use-section';

const STATE_ICON: Record<ReadyState, ReactNode> = {
  ok: <CircleCheck aria-hidden="true" className="size-4 text-ok" />,
  gap: <CircleAlert aria-hidden="true" className="size-4 text-warn" />,
  off: <CircleMinus aria-hidden="true" className="size-4 text-ink-3" />,
  unknown: <CircleDashed aria-hidden="true" className="size-4 text-ink-3" />,
};

/** Read by a screen reader in place of the icon. */
const STATE_LABEL: Record<ReadyState, string> = {
  ok: 'Ready',
  gap: 'Needs a fix',
  off: 'Off',
  unknown: 'Unknown',
};

/**
 * C-395: the top of project Settings — what a card needs to run here, each
 * row green or with the one place that fixes it. Refresh re-inspects the
 * project on its runner, for the facts only the runner can see (the DemoFlow
 * config); push access is C-396's push check, run here in place by a global
 * admin, since its route is global-admin only.
 */
export function ReadyToRun({
  project,
  isAdmin,
  canOperate,
  onRefreshed,
}: {
  project: ProjectDetail;
  isAdmin: boolean;
  canOperate: boolean;
  onRefreshed: () => void;
}) {
  const readiness = useReadiness(project.id);
  const setup = useSection(
    () => api<TerminalSetupView>(`/projects/${project.id}/terminal-setup`),
    [project.id],
  );
  const demos = useSection(
    () => api<DemoSettingsView>(`/projects/${project.id}/demos/settings`),
    [project.id],
  );
  const isGlobalAdmin = useCurrentUser().role === 'admin';
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();

  const checks = readyChecks({
    project,
    readiness: readiness.view,
    terminalSetup: setup.data ?? null,
    demos: demos.data ?? null,
    isAdmin,
    isGlobalAdmin,
    now: Date.now(),
  });
  const summary = readySummary(checks);

  const refresh = async () => {
    setBusy(true);
    try {
      await api(`/projects/${project.id}/refresh`, { method: 'POST' });
      onRefreshed();
      readiness.refresh();
      setup.refresh();
      demos.refresh();
    } catch (err) {
      showError(describeProjectError(err));
    } finally {
      setBusy(false);
    }
  };

  const runPushCheck = async () => {
    setBusy(true);
    try {
      const body: PushCheckRequest = {
        runnerId: project.runnerId,
        path: project.rootPath,
      };
      await api('/admin/projects/push-check', { method: 'POST', body });
      onRefreshed();
    } catch (err) {
      showError(describeProjectError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Ready to run"
      description={summary.headline}
      pad="none"
      bodyClassName="px-4 py-1"
      actions={
        <span className="flex items-center gap-2">
          <Badge
            size="md"
            tone={summary.tone}
            label={`${summary.ready} of ${summary.total}`}
          />
          {canOperate ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
        </span>
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {checks.map((check) => (
          <li
            key={check.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
          >
            <span className="shrink-0" title={STATE_LABEL[check.state]}>
              {STATE_ICON[check.state]}
              <span className="sr-only">{STATE_LABEL[check.state]}:</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{check.label}</span>
              <span className="text-xs text-ink-3">{check.detail}</span>
            </span>
            {check.fix ? (
              <Link
                href={check.fix.href}
                className={buttonClassName({ variant: 'glass', size: 'sm' })}
              >
                {check.fix.label}
              </Link>
            ) : check.run ? (
              <Button
                variant="glass"
                size="sm"
                disabled={busy}
                onClick={() => void runPushCheck()}
              >
                {busy ? 'Checking…' : check.run.label}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
