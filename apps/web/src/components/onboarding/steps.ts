import type {
  MyOnboardingFacts,
  OnboardingFacts,
  ProjectSummary,
} from '@nautelle/shared';
import type { RunnersFact } from '../../lib/prerequisites/facts';

export type StepId =
  | 'install'
  | 'pair'
  | 'project'
  | 'profile'
  | 'plugin'
  | 'push'
  | 'card'
  | 'github'
  | 'invite'
  | 'ai'
  | 'notifications'
  | 'open';

export interface Step {
  id: StepId;
  title: string;
  done: boolean;
  /** Not counted in "N of M", and never hides or shows the checklist. */
  optional: boolean;
  /** The page that does this step. */
  href?: string;
  cta?: string;
}

/** C-476: whose checklist — an admin sets Nautelle up, an operator uses it. */
export type Audience = 'admin' | 'operator';

export interface GettingStarted {
  audience: Audience;
  steps: Step[];
  /** Required steps done, for "N of M". */
  done: number;
  total: number;
  /** Every required step is done: the checklist is not shown. */
  complete: boolean;
  /**
   * The project the admin's project-scoped steps act on: the first connected
   * one. Null in an operator's checklist, whose steps carry their own links.
   */
  project: Pick<
    ProjectSummary,
    'id' | 'displayName' | 'runnerId' | 'rootPath'
  > | null;
  /** The push check the push step shows; null when none ran or unknown. */
  pushCheck: OnboardingFacts['pushCheck'];
}

export const RUNNERS_PATH = '/admin/runners';
export const CONNECT_PATH = '/projects?connect=1';
/** The Overview's checklist, where the rail's setup link goes. */
export const GETTING_STARTED_PATH = '/#getting-started';
export const GETTING_STARTED_ID = 'getting-started';
export const AI_PROVIDERS_PATH = '/admin/ai-providers';
export const NOTIFICATIONS_PATH = '/account/notifications';

const notificationsStep = (
  me: MyOnboardingFacts | null,
  optional: boolean,
): Step => ({
  id: 'notifications',
  title: 'Turn on notifications',
  done: me?.notifications === true,
  optional,
  href: NOTIFICATIONS_PATH,
  cta: 'Open notifications',
});

const summarize = (
  audience: Audience,
  steps: Step[],
  project: GettingStarted['project'],
  pushCheck: GettingStarted['pushCheck'],
): GettingStarted => {
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  return {
    audience,
    steps,
    done,
    total: required.length,
    complete: done === required.length,
    project,
    pushCheck,
  };
};

/**
 * The first-run checklist (issue #132, C-396) through to a first card with a
 * pull request, every step from real state. A paired runner implies it was
 * installed; revoked runners do not count (`runnersFact`). Only admins see
 * it, so `runners` is never `unknown` in practice — if it is, or `facts` has
 * not loaded, those steps read as not done rather than guessed.
 */
export function gettingStarted({
  runners,
  projects,
  facts,
  me,
}: {
  runners: RunnersFact;
  projects: readonly Pick<
    ProjectSummary,
    'id' | 'displayName' | 'runnerId' | 'rootPath'
  >[];
  facts: OnboardingFacts | null;
  /** C-476: the admin's own facts, for the notifications step. */
  me: MyOnboardingFacts | null;
}): GettingStarted {
  const paired = runners.kind === 'offline' || runners.kind === 'online';
  const online = runners.kind === 'online';
  const project = projects[0] ?? null;
  const steps: Step[] = [
    {
      id: 'install',
      title: 'Install the runner on the machine that holds your repositories',
      done: paired,
      optional: false,
    },
    {
      id: 'pair',
      title: 'Pair the runner and keep it online',
      done: online,
      optional: false,
      href: RUNNERS_PATH,
      cta: 'Open Runners',
    },
    {
      id: 'project',
      title: 'Connect a project',
      done: project !== null,
      optional: false,
      href: CONNECT_PATH,
      cta: 'Connect project',
    },
    {
      id: 'profile',
      title: 'Pick the runtime profile agents run with',
      done: facts?.profile === true,
      optional: false,
      href: project
        ? `/projects/${project.id}/settings?tab=general`
        : undefined,
      cta: 'Open settings',
    },
    {
      id: 'plugin',
      title: 'Install the Claude Code plugin',
      done: facts?.plugin === true,
      optional: false,
    },
    {
      id: 'push',
      title: 'Check that the runner can push',
      done: facts?.pushCheck?.ok === true,
      optional: false,
    },
    {
      id: 'card',
      title: 'Run a first card to a pull request',
      done: facts !== null && facts.firstCard !== 'none',
      optional: false,
      href: project ? `/projects/${project.id}/board` : undefined,
      cta: 'Open Board',
    },
    {
      id: 'github',
      title: 'Install the GitHub App',
      done: facts?.githubApp === true,
      optional: true,
      href: '/admin/integrations/github',
      cta: 'Open GitHub App',
    },
    {
      id: 'invite',
      title: 'Invite teammates',
      done: facts?.teammates === true,
      optional: true,
      href: '/admin/users',
      cta: 'Open Users',
    },
    {
      id: 'ai',
      title: 'Add an AI provider',
      done: facts?.aiProvider === true,
      optional: true,
      href: AI_PROVIDERS_PATH,
      cta: 'Open AI providers',
    },
    notificationsStep(me, true),
  ];
  return summarize('admin', steps, project, facts?.pushCheck ?? null);
}

/**
 * C-476: an operator's Getting started — a project an admin shared with them,
 * notifications, and a card they run. Every step is the caller's own
 * (`GET /onboarding/me`); unloaded facts read as not done.
 */
export function operatorGettingStarted(
  me: MyOnboardingFacts | null,
): GettingStarted {
  const project = me?.project ?? null;
  const steps: Step[] = [
    // Done once an admin shares a project: the Overview below lists it.
    {
      id: 'open',
      title: 'Open a project',
      done: project !== null,
      optional: false,
    },
    notificationsStep(me, false),
    {
      id: 'card',
      title: 'Run a card',
      done: me?.ranCard === true,
      optional: false,
      href: project ? `/projects/${project.id}/board` : undefined,
      cta: 'Open Board',
    },
  ];
  return summarize('operator', steps, null, null);
}

/** The first required step that is not done: the one the checklist opens on. */
export const currentStep = (state: GettingStarted): Step | undefined =>
  state.steps.find((step) => !step.optional && !step.done);
