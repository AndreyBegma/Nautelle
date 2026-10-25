'use client';

import type { OnboardingFacts, ProjectSummary } from '@nautelle/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
} from 'react';
import { api } from '../../lib/api';
import type { Loadable, RunnersFact } from '../../lib/prerequisites/facts';
import { usePrerequisites } from '../../lib/prerequisites/use-prerequisites';
import { useSection } from '../../lib/section/use-section';
import { useCurrentUser } from '../shell/user-context';
import { type GettingStarted, gettingStarted } from './steps';

/** While setup is unfinished, the admin is usually pairing on another screen. */
const SETUP_POLL_MS = 15_000;

export interface GettingStartedValue {
  /** Undefined until the runners and projects have loaded, and for non-admins. */
  setup: GettingStarted | undefined;
  runners: Loadable<RunnersFact>;
  /** Looks again now, e.g. after a step was done on this page. */
  reload: () => void;
}

const GettingStartedContext = createContext<GettingStartedValue>({
  setup: undefined,
  runners: { state: 'loading' },
  reload: () => {},
});

/**
 * Getting started for the whole shell (C-396): the Overview's checklist and
 * the rail's setup link read the same state, loaded once. Admins only; it
 * polls while a required step is open, since steps finish elsewhere (Runners,
 * a terminal, the Board).
 */
export function GettingStartedProvider({ children }: { children: ReactNode }) {
  const isAdmin = useCurrentUser().role === 'admin';
  const { runners, reload: reloadRunners } = usePrerequisites({
    runners: isAdmin,
  });
  const projects = useSection(
    () =>
      isAdmin ? api<ProjectSummary[]>('/projects') : Promise.resolve(undefined),
    [isAdmin],
  );
  const facts = useSection(
    () =>
      isAdmin
        ? api<OnboardingFacts>('/admin/onboarding')
        : Promise.resolve(undefined),
    [isAdmin],
  );

  const setup =
    isAdmin && runners.state === 'ready' && projects.data !== undefined
      ? gettingStarted({
          runners: runners.value,
          projects: projects.data,
          facts: facts.data ?? null,
        })
      : undefined;
  const settingUp = isAdmin && setup?.complete !== true;

  const { refresh: refreshProjects } = projects;
  const { refresh: refreshFacts } = facts;
  const reload = useCallback(() => {
    reloadRunners();
    refreshProjects();
    refreshFacts();
  }, [reloadRunners, refreshProjects, refreshFacts]);

  useEffect(() => {
    if (!settingUp) return;
    const timer = setInterval(reload, SETUP_POLL_MS);
    return () => clearInterval(timer);
  }, [settingUp, reload]);

  return (
    <GettingStartedContext.Provider value={{ setup, runners, reload }}>
      {children}
    </GettingStartedContext.Provider>
  );
}

export const useGettingStarted = (): GettingStartedValue =>
  useContext(GettingStartedContext);
