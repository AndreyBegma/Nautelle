'use client';

import type { ProjectSummary } from '@nautelle/shared';
import { useInbox } from '../inbox/inbox-context';
import { LiveSessions } from './live-sessions';
import { NeedsYou } from './needs-you';
import { ProjectsPanel } from './projects-panel';
import { RecentActivity } from './recent-activity';
import { SpendTrend } from './spend-trend';
import { StatsStrip } from './stats-strip';
import { useDashboard } from './use-dashboard';

/** The Overview below Getting started: a stats strip over two columns. */
export function Dashboard({ projects }: { projects: ProjectSummary[] }) {
  const dashboard = useDashboard(projects);
  const { facts } = dashboard;
  const inbox = useInbox();
  // A project's count is what waits on the person there in the Inbox.
  const needsByProject = new Map<string, number>();
  for (const { projectId } of inbox.data?.items ?? []) {
    needsByProject.set(projectId, (needsByProject.get(projectId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <StatsStrip {...dashboard} />
      <div className="grid grid-cols-1 items-start gap-6 desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <NeedsYou />
          <LiveSessions projects={projects} facts={facts} />
          <RecentActivity projects={projects} recent={dashboard.recent} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ProjectsPanel
            projects={projects}
            facts={facts}
            costByProject={dashboard.costByProject}
            needsByProject={needsByProject}
          />
          <SpendTrend spend={dashboard.spend} />
        </div>
      </div>
    </div>
  );
}
