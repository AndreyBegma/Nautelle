'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { SectionUnavailable } from '@andrewbehma/glass-ui/section-unavailable';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import Link from 'next/link';
import { type ComponentProps, Suspense } from 'react';
import { useInbox } from '../../../components/inbox/inbox-context';
import { InboxGroup } from '../../../components/inbox/inbox-group';
import { PageHeader } from '../../../components/page-header/page-header';
import { PrerequisiteBanner } from '../../../components/prerequisites/prerequisite-banner';
import { useCurrentUser } from '../../../components/shell/user-context';
import { useUrlFilters } from '../../../lib/filters/use-url-filters';
import {
  countInboxKinds,
  EMPTY_INBOX_FILTERS,
  emptyKindText,
  filterInboxItems,
  groupInboxByProject,
  INBOX_FILTER_CODEC,
  inboxItemsOfProject,
  inboxMeta,
} from '../../../lib/inbox/format';
import { InboxFilters } from './inbox-filters';

/** The empty state's action keeps client-side navigation. */
const NextLink: NonNullable<ComponentProps<typeof EmptyState>['link']> = ({
  href,
  className,
  children,
  ...rest
}) => (
  <Link href={href} className={className} {...rest}>
    {children}
  </Link>
);

const DESCRIPTION = 'Everything that waits on you, with the action right here.';

/**
 * The Inbox (C-390, ADR-0103): every item that waits for the caller's
 * decision across their projects, grouped by project, oldest first, each with
 * its action. The shell holds the read (`useInbox`), so the rail's count and
 * this page agree, and a live push removes a handled item from both.
 */
function InboxView() {
  const user = useCurrentUser();
  const inbox = useInbox();
  const url = useUrlFilters(INBOX_FILTER_CODEC);
  const { filters } = url;
  const view = inbox.data;
  const now = Date.now();

  const header = (
    <PageHeader
      eyebrow="Workspace"
      title="Inbox"
      description={DESCRIPTION}
      meta={view ? (inboxMeta(view.items, now) ?? undefined) : undefined}
    />
  );

  if (!view) {
    return (
      <>
        {header}
        {inbox.error !== null ? (
          <SectionUnavailable
            title="The Inbox is unavailable"
            stillWorks="Your cards keep running; reload to try again."
            action={
              <Button
                variant="glass"
                size="sm"
                onClick={inbox.retry}
                disabled={inbox.loading}
              >
                Reload
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </>
    );
  }

  const ofProject = inboxItemsOfProject(view.items, filters.projectId);
  const shown = filterInboxItems(view.items, filters);
  const groups = groupInboxByProject(shown);

  return (
    <>
      {header}
      <div className="flex flex-col gap-4">
        {inbox.error !== null ? (
          <SectionUnavailable
            title="The Inbox is not answering"
            stillWorks="What it showed last is below; reload to try again."
            action={
              <Button
                variant="glass"
                size="sm"
                onClick={inbox.retry}
                disabled={inbox.loading}
              >
                Reload
              </Button>
            }
          />
        ) : null}
        {view.missing.map((project) => (
          <PrerequisiteBanner
            key={project.projectId}
            tone="warn"
            title={`${project.projectName} is missing from this list.`}
            body={project.message}
          />
        ))}
        {view.total === 0 ? (
          <EmptyState
            title="Nothing waits on you"
            description="Designs, questions, merges and failures show up here as they happen."
            link={NextLink}
            action={{ label: 'Open Work', href: '/work' }}
          />
        ) : (
          <>
            <InboxFilters
              url={url}
              projects={view.projects}
              counts={countInboxKinds(ofProject)}
              total={ofProject.length}
            />
            {groups.length === 0 ? (
              <EmptyState
                {...(filters.kind
                  ? emptyKindText(filters.kind, view.total)
                  : {
                      title: 'Nothing waits in this project',
                      description:
                        view.total === 1
                          ? '1 thing waits on you elsewhere.'
                          : `${view.total} things wait on you elsewhere.`,
                    })}
                action={{
                  label: 'Show all',
                  onClick: () => url.replace(EMPTY_INBOX_FILTERS),
                }}
              />
            ) : (
              groups.map((group) => (
                <InboxGroup
                  key={group.projectId}
                  group={group}
                  now={now}
                  isAdmin={user.role === 'admin'}
                  onChanged={inbox.refresh}
                />
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function InboxPage() {
  // `useSearchParams` needs a boundary for the static shell.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InboxView />
    </Suspense>
  );
}
