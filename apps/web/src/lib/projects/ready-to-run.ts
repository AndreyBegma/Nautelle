import type {
  DemoSettingsView,
  ProjectDetail,
  ProjectReadinessView,
  TerminalSetupView,
} from '@nautelle/shared';
import { RUNNERS_PAGE } from '../prerequisites/copy';
import { readinessCopy } from '../readiness/copy';
import { BASE_SOURCE_LABEL } from './format';
import { settingsItemHref } from './settings-sections';

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
  /** A fix the block runs in place instead of a link: the push check (C-396). */
  run?: { kind: 'push_check'; label: string };
  /** A gap here keeps cards from running at all. */
  blocking: boolean;
}

/** What the Ready to run block reads; null is not loaded (or not loadable). */
export interface ReadyFacts {
  project: ProjectDetail;
  readiness: ProjectReadinessView | null;
  terminalSetup: TerminalSetupView | null;
  demos: DemoSettingsView | null;
  /** The caller's project role is admin: edits project settings. */
  isAdmin: boolean;
  /**
   * The caller's global role is admin: opens Runners and runs the push check,
   * whose routes are global-admin only.
   */
  isGlobalAdmin: boolean;
  /** Epoch ms, to tell a stale push check. */
  now: number;
}

/** A push check older than this may no longer hold: keys and tokens change. */
export const PUSH_CHECK_STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const REFRESH_HINT = 'Refresh the project once its runner reports it.';

function runnerCheck({
  project,
  readiness,
  isGlobalAdmin,
}: ReadyFacts): ReadyCheck {
  const runners = isGlobalAdmin
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
      detail: `${project.runnerName} is ${project.runnerStatus}, so nothing can run.${isGlobalAdmin ? '' : ' Ask an admin to bring it back.'}`,
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
        isAdmin: isGlobalAdmin,
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
            href: settingsItemHref(project.id, 'general'),
          },
        }
      : {}),
  };
}

/**
 * Push access is C-396's push check: `git push --dry-run` on the runner with
 * the credentials a card worker pushes with, kept per runner and path.
 */
function pushCheck({ project, isGlobalAdmin, now }: ReadyFacts): ReadyCheck {
  const base = { id: 'push', label: 'Push access', blocking: true } as const;
  const check = project.pushCheck;
  const run = (label: string) =>
    isGlobalAdmin ? { run: { kind: 'push_check', label } as const } : {};
  const askAdmin = isGlobalAdmin ? '' : ' Ask an admin to run the push check.';
  if (!check) {
    return {
      ...base,
      state: 'unknown',
      detail: `No push check has run on this checkout yet.${askAdmin}`,
      ...run('Run push check'),
    };
  }
  if (!check.ok) {
    return {
      ...base,
      state: 'gap',
      detail: `${check.message}${askAdmin}`,
      ...run('Check again'),
    };
  }
  const age = now - Date.parse(check.checkedAt);
  if (age > PUSH_CHECK_STALE_DAYS * DAY_MS) {
    return {
      ...base,
      state: 'unknown',
      detail: `Passed ${Math.floor(age / DAY_MS)} days ago; run it again to be sure.${askAdmin}`,
      ...run('Check again'),
    };
  }
  return { ...base, state: 'ok', detail: check.message };
}

function pluginCheck({ project, terminalSetup }: ReadyFacts): ReadyCheck {
  const base = {
    id: 'plugin',
    label: 'Claude Code plugin',
    blocking: false,
  } as const;
  const fix = {
    label: 'Set up the plugin',
    href: settingsItemHref(project.id, 'sessions'),
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
    href: settingsItemHref(project.id, 'demo-videos'),
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
  /** Checks that are settled: `ok` and `off`; `unknown` is not ready. */
  ready: number;
  total: number;
  /** A blocking gap: cards cannot run. */
  blocked: boolean;
  /** No blocking gap, but a blocking check has not been verified. */
  unverified: boolean;
  /** The badge tone: `ok` only when every check is settled. */
  tone: 'ok' | 'warn' | 'danger';
  /** One line for the top of the block. */
  headline: string;
}

const labels = (checks: readonly ReadyCheck[]) =>
  checks.map((check) => check.label.toLowerCase()).join(', ');

export function readySummary(checks: readonly ReadyCheck[]): ReadySummary {
  const gaps = checks.filter((check) => check.state === 'gap');
  const unknown = checks.filter((check) => check.state === 'unknown');
  const blocking = gaps.filter((check) => check.blocking);
  const unverified = unknown.filter((check) => check.blocking);
  const headline =
    blocking.length > 0
      ? `Cards cannot run here yet: ${labels(blocking)}.`
      : unverified.length > 0
        ? `Not verified yet: ${labels(unverified)}.`
        : gaps.length > 0
          ? 'Cards can run; the marked rows still need a look.'
          : unknown.length > 0
            ? 'Cards can run; some checks have not run yet.'
            : 'Everything a card needs is in place.';
  const ready = checks.length - gaps.length - unknown.length;
  return {
    ready,
    total: checks.length,
    blocked: blocking.length > 0,
    unverified: blocking.length === 0 && unverified.length > 0,
    tone:
      blocking.length > 0 ? 'danger' : ready < checks.length ? 'warn' : 'ok',
    headline,
  };
}
