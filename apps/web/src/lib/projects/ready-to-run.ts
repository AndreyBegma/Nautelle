import type {
  DemoSettingsView,
  ProjectDetail,
  ProjectReadinessView,
  TerminalSetupView,
} from '@nautelle/shared';
import { RUNNERS_PAGE } from '../prerequisites/copy';
import { readinessCopy } from '../readiness/copy';
import { BASE_SOURCE_LABEL } from './format';
import type { SettingsItemId } from './settings-sections';

/**
 * - `ok` — in place;
 * - `gap` — missing, with what is wrong and, when there is one, its fix;
 * - `off` — an optional feature that is turned off: not a gap;
 * - `unknown` — the facts cannot tell yet (still loading, or a runner older
 *   than the fact).
 */
export type ReadyState = 'ok' | 'gap' | 'off' | 'unknown';

export type ReadyCheckId =
  | 'runner'
  | 'profile'
  | 'base'
  | 'push'
  | 'plugin'
  | 'demos';

export interface ReadyCheck {
  id: ReadyCheckId;
  label: string;
  state: ReadyState;
  detail: string;
  /** The one place that fixes it. */
  fix?: { label: string; href: string };
  /** A gap here keeps cards from running at all. */
  blocking: boolean;
}

/** What the Ready to run block reads; null is not loaded (or not loadable). */
export interface ReadyFacts {
  project: ProjectDetail;
  readiness: ProjectReadinessView | null;
  terminalSetup: TerminalSetupView | null;
  demos: DemoSettingsView | null;
  isAdmin: boolean;
}

const settingsHref = (projectId: string, item: SettingsItemId): string =>
  `/projects/${projectId}/settings?tab=${item}`;

const REFRESH_HINT = 'Refresh the project once its runner reports it.';

function runnerCheck({ project, readiness, isAdmin }: ReadyFacts): ReadyCheck {
  const runners = isAdmin
    ? { fix: { label: 'Open Runners', href: RUNNERS_PAGE } }
    : {};
  const base = {
    id: 'runner',
    label: 'Runner online',
    blocking: true,
  } as const;
  if (project.runnerStatus !== 'online') {
    return {
      ...base,
      state: 'gap',
      detail: `${project.runnerName} is ${project.runnerStatus}, so nothing can run.`,
      ...runners,
    };
  }
  const outdated = readiness?.actions.run.find(
    (blocker) => blocker.code === 'runner_outdated',
  );
  if (outdated) {
    return {
      ...base,
      state: 'gap',
      detail: readinessCopy(outdated, {
        isAdmin,
        projectId: project.id,
        suggestion: null,
      }).text,
      ...runners,
    };
  }
  return { ...base, state: 'ok', detail: project.runnerName };
}

function profileCheck({ project, readiness, isAdmin }: ReadyFacts): ReadyCheck {
  const base = {
    id: 'profile',
    label: 'Runtime profile',
    blocking: true,
  } as const;
  if (!readiness) return { ...base, state: 'unknown', detail: 'Checking…' };
  const noProfile = readiness.actions.run.find(
    (blocker) => blocker.code === 'no_profile',
  );
  if (!noProfile) {
    return {
      ...base,
      state: 'ok',
      detail: readiness.profile?.label ?? 'Set',
    };
  }
  const copy = readinessCopy(noProfile, {
    isAdmin,
    projectId: project.id,
    suggestion: readiness.suggestion,
  });
  return {
    ...base,
    state: 'gap',
    detail: copy.text,
    ...(copy.href
      ? { fix: { label: 'Choose a profile', href: copy.href } }
      : {}),
  };
}

function baseCheck({ project, isAdmin }: ReadyFacts): ReadyCheck {
  const base = { id: 'base', label: 'Base branch', blocking: false } as const;
  if (project.baseOverride) {
    return {
      ...base,
      state: 'ok',
      detail: `${project.baseOverride}, set in General`,
    };
  }
  if (project.baseSource !== 'default') {
    return {
      ...base,
      state: 'ok',
      detail: `${project.baseBranch}, from ${BASE_SOURCE_LABEL[project.baseSource]}`,
    };
  }
  return {
    ...base,
    state: 'gap',
    detail: `None was detected, so pull requests go to ${project.baseBranch}, a guess.${isAdmin ? '' : ' Ask an admin to set it.'}`,
    ...(isAdmin
      ? {
          fix: {
            label: 'Set the base branch',
            href: settingsHref(project.id, 'general'),
          },
        }
      : {}),
  };
}

function pushCheck({ project }: ReadyFacts): ReadyCheck {
  const base = { id: 'push', label: 'Push access', blocking: true } as const;
  if (project.canPush === true) {
    return {
      ...base,
      state: 'ok',
      detail: `The runner’s GitHub login can push to ${project.repo}.`,
    };
  }
  if (project.canPush === false) {
    return {
      ...base,
      state: 'gap',
      detail: `The runner’s GitHub login cannot push to ${project.repo}, so a card cannot open its pull request. Run gh auth login on the runner with an account that can, then refresh.`,
    };
  }
  return {
    ...base,
    state: 'unknown',
    detail: `Not reported yet. ${REFRESH_HINT}`,
  };
}

function pluginCheck({ project, terminalSetup }: ReadyFacts): ReadyCheck {
  const base = {
    id: 'plugin',
    label: 'Claude Code plugin',
    blocking: false,
  } as const;
  const fix = {
    label: 'Set up the plugin',
    href: settingsHref(project.id, 'sessions'),
  };
  if (!terminalSetup) return { ...base, state: 'unknown', detail: 'Checking…' };
  const plugins = terminalSetup.items.filter((item) => item.id === 'plugin');
  const missing = plugins.filter((item) => item.state === 'todo');
  if (missing.length > 0) {
    const keys = missing.map((item) => item.profileKey).filter(Boolean);
    return {
      ...base,
      state: 'gap',
      detail: `Not installed${keys.length ? ` in ${keys.join(', ')}` : ''}, so terminal sessions do not reach the Board.`,
      fix,
    };
  }
  if (plugins.length > 0 && plugins.every((item) => item.state === 'done')) {
    return { ...base, state: 'ok', detail: 'Installed in every profile.' };
  }
  return {
    ...base,
    state: 'unknown',
    detail:
      plugins.length === 0
        ? 'No profile to check.'
        : 'The runner has not reported it yet.',
    fix,
  };
}

function demosCheck({ project, demos, isAdmin }: ReadyFacts): ReadyCheck {
  const base = { id: 'demos', label: 'Demo videos', blocking: false } as const;
  const fix = {
    label: isAdmin && demos && !demos.enabled ? 'Turn on' : 'Open Demo videos',
    href: settingsHref(project.id, 'demo-videos'),
  };
  if (!demos) return { ...base, state: 'unknown', detail: 'Checking…' };
  if (!demos.enabled) {
    return {
      ...base,
      state: 'off',
      detail: 'Off: finished UI cards merge without a demo.',
      ...(isAdmin ? { fix } : {}),
    };
  }
  if (project.hasDemoflowConfig === true) {
    return {
      ...base,
      state: 'ok',
      detail: 'On, and demoflow.config.json is in the repository.',
    };
  }
  if (project.hasDemoflowConfig === false) {
    return {
      ...base,
      state: 'gap',
      detail:
        'On, but the repository has no demoflow.config.json, so no demo is recorded.',
      fix,
    };
  }
  return {
    ...base,
    state: 'unknown',
    detail: `On; whether demoflow.config.json exists is not reported yet. ${REFRESH_HINT}`,
  };
}

/**
 * C-395: the Ready to run block at the top of Settings — what a card needs
 * to run on this project, in the order a person fixes it.
 */
export function readyChecks(facts: ReadyFacts): ReadyCheck[] {
  return [
    runnerCheck(facts),
    profileCheck(facts),
    baseCheck(facts),
    pushCheck(facts),
    pluginCheck(facts),
    demosCheck(facts),
  ];
}

export interface ReadySummary {
  /** Checks that are not a gap: `ok`, `off` and `unknown`. */
  ready: number;
  total: number;
  /** A blocking gap: cards cannot run. */
  blocked: boolean;
  /** One line for the top of the block. */
  headline: string;
}

export function readySummary(checks: readonly ReadyCheck[]): ReadySummary {
  const gaps = checks.filter((check) => check.state === 'gap');
  const blocking = gaps.filter((check) => check.blocking);
  const headline =
    blocking.length > 0
      ? `Cards cannot run here yet: ${blocking.map((check) => check.label.toLowerCase()).join(', ')}.`
      : gaps.length > 0
        ? 'Cards can run; the marked rows still need a look.'
        : 'Everything a card needs is in place.';
  return {
    ready: checks.length - gaps.length,
    total: checks.length,
    blocked: blocking.length > 0,
    headline,
  };
}
