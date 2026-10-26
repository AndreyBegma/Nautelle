'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { Tab, TabGroup, TabList, TabPanel } from '@andrewbehma/glass-ui/tabs';
import type { ProjectDetail } from '@nautelle/shared';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PageHeader } from '../../../../../components/page-header/page-header';
import { WatchRefusalBanner } from '../../../../../components/prerequisites/prerequisite-banner';
import { ScrollX } from '../../../../../components/scroll-x/scroll-x';
import { ApiError, api } from '../../../../../lib/api';
import { useLive } from '../../../../../lib/live/use-live';
import { describeProjectError } from '../../../../../lib/projects/format';
import {
  SETTINGS_ITEM_SECTION,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
  type SettingsItemId,
  settingsItemOf,
} from '../../../../../lib/projects/settings-sections';
import { useTabParam } from '../../../../../lib/projects/use-tab-param';
import { STATUS_TONE } from '../../../../../lib/runners/format';
import { useErrorToast } from '../../../../../lib/section/use-error-toast';
import { AiDigestTab } from './ai-digest-tab';
import { AwayTab } from './away-tab';
import { BoardTab } from './board-tab';
import { BudgetTab } from './budget/budget-tab';
import { DemoVideosTab } from './demo-videos-tab';
import { DesignTab } from './design/design-tab';
import { DocsTab } from './docs-tab';
import { GeneralTab } from './general-tab';
import { GitHubAppRow } from './github-app-row';
import { LabelsTab } from './labels/labels-tab';
import { MembersTab } from './members-tab';
import { OrchestratorTab } from './orchestrator-tab';
import { PlannerTab } from './planner-tab';
import { ReadyToRun } from './ready-to-run';
import { ReviewTab } from './review-tab';
import { RulesTab } from './rules/rules-tab';
import { SessionsTab } from './sessions-tab';
import { SettingsIndex } from './settings-index';
import { SettingsSearchBox } from './settings-search-box';
import { SlackTab } from './slack-tab';
import { StewardTab } from './steward-tab';
import { TokenSaverTab } from './token-saver-tab';

/** What a block needs from the page. */
interface BlockContext {
  project: ProjectDetail;
  isAdmin: boolean;
  canOperate: boolean;
  reload: () => void;
}

/** One renderer per former tab; the sections are in `SETTINGS_SECTIONS`. */
const BLOCKS: Readonly<
  Record<SettingsItemId, (ctx: BlockContext) => ReactNode>
> = {
  general: ({ project, isAdmin, reload }) => (
    <div className="flex flex-col gap-4">
      <GeneralTab project={project} isAdmin={isAdmin} onChanged={reload} />
      <GitHubAppRow projectId={project.id} />
    </div>
  ),
  docs: ({ project, isAdmin, canOperate, reload }) => (
    <DocsTab
      project={project}
      isAdmin={isAdmin}
      canRefresh={canOperate}
      onChanged={reload}
    />
  ),
  rules: ({ project, isAdmin }) => (
    <RulesTab projectId={project.id} isAdmin={isAdmin} />
  ),
  labels: ({ project, isAdmin }) => (
    <LabelsTab projectId={project.id} isAdmin={isAdmin} />
  ),
  orchestrator: ({ project, isAdmin, canOperate }) => (
    <OrchestratorTab
      project={project}
      isAdmin={isAdmin}
      canOperate={canOperate}
    />
  ),
  members: ({ project, isAdmin }) => (
    <MembersTab projectId={project.id} isAdmin={isAdmin} />
  ),
  slack: ({ project, isAdmin }) => (
    <SlackTab projectId={project.id} isAdmin={isAdmin} />
  ),
  budget: ({ project, isAdmin }) => (
    <BudgetTab projectId={project.id} isAdmin={isAdmin} />
  ),
  planner: ({ project, isAdmin }) => (
    <PlannerTab projectId={project.id} isAdmin={isAdmin} />
  ),
  design: ({ project, isAdmin, canOperate }) => (
    <DesignTab
      projectId={project.id}
      isAdmin={isAdmin}
      canOperate={canOperate}
    />
  ),
  board: ({ project, isAdmin, canOperate }) => (
    <BoardTab
      projectId={project.id}
      isAdmin={isAdmin}
      canOperate={canOperate}
      contentOn={project.shipSessionContent ?? false}
    />
  ),
  review: ({ project, isAdmin }) => (
    <ReviewTab projectId={project.id} isAdmin={isAdmin} />
  ),
  'demo-videos': ({ project, isAdmin }) => (
    <DemoVideosTab projectId={project.id} isAdmin={isAdmin} />
  ),
  'token-saver': ({ project, isAdmin, canOperate }) => (
    <TokenSaverTab
      projectId={project.id}
      isAdmin={isAdmin}
      canOperate={canOperate}
    />
  ),
  steward: ({ project, isAdmin }) => (
    <StewardTab projectId={project.id} isAdmin={isAdmin} />
  ),
  'ai-digest': ({ project, isAdmin }) => (
    <AiDigestTab projectId={project.id} isAdmin={isAdmin} />
  ),
  sessions: ({ project, isAdmin, reload }) => (
    <SessionsTab project={project} isAdmin={isAdmin} onChanged={reload} />
  ),
  away: ({ project, isAdmin, canOperate, reload }) => (
    <AwayTab
      project={project}
      isAdmin={isAdmin}
      canOperate={canOperate}
      onChanged={reload}
    />
  ),
};

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectDetail>();
  const [missing, setMissing] = useState(false);
  // `?tab=` carries the section; a former tab's id (`?tab=budget`, still in
  // links across the app) opens its section and scrolls to its block.
  const [section, setSection] = useTabParam(
    SETTINGS_SECTION_IDS,
    SETTINGS_ITEM_SECTION,
  );
  const anchor = settingsItemOf(useSearchParams().get('tab'));
  const router = useRouter();
  const pathname = usePathname();
  const showError = useErrorToast();
  // C-395: the block a search result jumped to, outlined for a moment.
  const [landed, setLanded] = useState<SettingsItemId | null>(null);

  const load = useCallback(async () => {
    try {
      setProject(await api<ProjectDetail>(`/projects/${projectId}`));
      setMissing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else showError(describeProjectError(err));
    }
  }, [projectId, showError]);

  useEffect(() => {
    setProject(undefined);
    load();
  }, [load]);

  // Scroll to a deep-linked block once the page has drawn it. The first block
  // of a section is already at the top, under the header.
  const loaded = project !== undefined;
  // A search result scrolls even to the first block: the page may be far down.
  const searched = useRef<SettingsItemId | null>(null);
  useEffect(() => {
    if (!loaded || !anchor) return;
    const first = SETTINGS_SECTIONS.find(({ id }) => id === section)?.items[0];
    const wasSearched = searched.current === anchor;
    searched.current = null;
    if (first?.id === anchor && !wasSearched) return;
    document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [loaded, anchor, section]);

  useEffect(() => {
    if (!landed) return;
    const timer = setTimeout(() => setLanded(null), 2000);
    return () => clearTimeout(timer);
  }, [landed]);

  // A search result: its block's id opens the section and scrolls there, as
  // a deep link does. The same id again does not change the URL, so it
  // scrolls by hand.
  const jump = (item: SettingsItemId) => {
    setLanded(item);
    if (item === anchor) {
      document.getElementById(item)?.scrollIntoView({ block: 'start' });
      return;
    }
    searched.current = item;
    router.replace(`${pathname}?tab=${item}`, { scroll: false });
  };

  // The API publishes no project events yet; any that arrive reload the page.
  useLive(`project:${projectId}`, () => {
    void load();
  });

  if (missing) {
    return (
      <EmptyState
        title="Project not found"
        description="It was removed, or you are not a member of it."
      />
    );
  }
  if (!project) return <Skeleton className="h-64 w-full" />;

  const isAdmin = project.role === 'admin';
  const canOperate = project.role !== 'viewer';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="mb-0"
        title="Settings"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{project.displayName}</span>
            <span>· {project.repo}</span>
            <span className="inline-flex items-center gap-1">
              <Badge
                dot
                tone={STATUS_TONE[project.runnerStatus]}
                aria-hidden="true"
              />
              {project.runnerName} ({project.runnerStatus})
            </span>
            <span>· your role: {project.role}</span>
          </span>
        }
      />
      {/* #691: an online runner whose policy refuses the project. */}
      <WatchRefusalBanner project={project} />
      <SettingsSearchBox onJump={jump} />
      <ReadyToRun
        project={project}
        isAdmin={isAdmin}
        canOperate={canOperate}
        onRefreshed={() => void load()}
      />

      <TabGroup
        value={section}
        onValueChange={(next) => {
          const id = SETTINGS_SECTION_IDS.find((s) => s === next);
          if (id) setSection(id);
        }}
      >
        <ScrollX>
          <TabList aria-label="Project settings" className="min-w-max">
            {SETTINGS_SECTIONS.map(({ id, label }) => (
              <Tab key={id} value={id} className="whitespace-nowrap">
                {label}
              </Tab>
            ))}
          </TabList>
        </ScrollX>

        {SETTINGS_SECTIONS.map(({ id, items }) => (
          <TabPanel key={id} value={id} className="pt-6">
            {/* A section is one page of blocks; from desktop up an index
                of them sits beside it (the S-7 mockup). */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 desktop:grid-cols-[168px_minmax(0,1fr)]">
              <SettingsIndex items={items} />
              <div className="flex flex-col gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    id={item.id}
                    className={`scroll-mt-4 rounded-xl transition-shadow ${
                      landed === item.id ? 'ring-2 ring-accent/50' : ''
                    }`}
                  >
                    {BLOCKS[item.id]({
                      project,
                      isAdmin,
                      canOperate,
                      reload: load,
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TabPanel>
        ))}
      </TabGroup>
    </div>
  );
}
