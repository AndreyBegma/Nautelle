'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { SectionUnavailable } from '@andrewbehma/glass-ui/section-unavailable';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import type { ProjectSummary } from '@nautelle/shared';
import Link from 'next/link';
import { type ComponentProps, useEffect } from 'react';
import { GettingStarted } from '../../components/onboarding/getting-started';
import { useGettingStarted } from '../../components/onboarding/getting-started-context';
import { CONNECT_PATH } from '../../components/onboarding/steps';
import { Dashboard } from '../../components/overview/dashboard';
import { PageHeader } from '../../components/page-header/page-header';
import { AsyncSection } from '../../components/prerequisites/async-section';
import { useCurrentUser } from '../../components/shell/user-context';
import { api } from '../../lib/api';
import { useSection } from '../../lib/section/use-section';

/** The header's primary action keeps client-side navigation. */
const NextLink: NonNullable<ComponentProps<typeof PageHeader>['link']> = ({
  href,
  className,
  children,
  ...rest
}) => (
  <Link href={href} className={className} {...rest}>
    {children}
  </Link>
);

export default function OverviewPage() {
  const isAdmin = useCurrentUser().role === 'admin';
  const projects = useSection(() => api<ProjectSummary[]>('/projects'), []);
  const { setup, runners, reload } = useGettingStarted();

  // The checklist polls on its own; a project connected meanwhile shows here.
  const { refresh } = projects;
  const projectCount = setup?.project ? 1 : 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first project is the trigger
  useEffect(() => {
    if (projectCount > 0) refresh();
  }, [projectCount]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        eyebrow="Workspace"
        title="Overview"
        description="Every project at a glance, and what needs you first."
        primaryAction={
          isAdmin ? { label: 'Connect project', href: CONNECT_PATH } : undefined
        }
        primaryActionOnPhone="hidden"
        link={NextLink}
      />

      {isAdmin && runners.state === 'loading' ? (
        <Skeleton className="h-48 w-full" />
      ) : null}
      {isAdmin && runners.state === 'error' ? (
        <SectionUnavailable
          title="Could not check the runners for Getting started"
          stillWorks="The dashboard below still works."
          action={
            <Button variant="glass" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : null}
      {setup && !setup.complete && runners.state === 'ready' ? (
        <GettingStarted
          state={setup}
          runners={runners.value}
          onChange={reload}
        />
      ) : null}

      <AsyncSection
        section={projects}
        unavailable={{ title: 'Projects are not answering' }}
        skeleton={
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
            {['a', 'b', 'c'].map((key) => (
              <Skeleton key={key} className="h-28 w-full" />
            ))}
          </div>
        }
        empty={
          isAdmin ? (
            <EmptyState
              title="No projects yet"
              description="A project is a GitHub repository cloned on a paired runner."
              action={
                <Link
                  href={CONNECT_PATH}
                  className={buttonClassName({
                    variant: 'glass',
                    size: 'sm',
                  })}
                >
                  Connect project
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No projects yet"
              description="Ask an administrator to add you to a project."
            />
          )
        }
      >
        {(list) => <Dashboard projects={list} />}
      </AsyncSection>
    </div>
  );
}
