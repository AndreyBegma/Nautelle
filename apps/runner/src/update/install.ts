import { LAUNCH_AGENT_LABEL, SERVICE_NAME } from '../service';
import { PACKAGE_NAME } from './check';

export type Manager = 'npm' | 'bun' | 'pnpm' | 'yarn';

/** How the running binary was installed, read from where it lives. */
export type Install =
  /** An npx / bunx / pnpm dlx cache: it already runs the latest. */
  | { kind: 'ephemeral' }
  /** A global install by a package manager the CLI can run. */
  | { kind: 'global'; manager: Manager }
  /** A Homebrew keg. */
  | { kind: 'brew' }
  /** A project's `node_modules`, a release tarball, anything else. */
  | { kind: 'unknown' };

const EPHEMERAL = [/\/_npx\//, /\/bunx-[^/]*\//, /\/dlx[-/]/];

/**
 * The install `binary` belongs to. The platform package holds the binary, so
 * its path names the global directory of the manager that installed it:
 * npm's `<prefix>/lib/node_modules` (also under fnm, nvm or Volta), bun's
 * `~/.bun/install/global`, pnpm's `<PNPM_HOME>/global` and yarn's
 * `~/.config/yarn/global`.
 */
export const detectInstall = (binary: string): Install => {
  const path = binary.replace(/\\/g, '/');
  if (EPHEMERAL.some((pattern) => pattern.test(path))) {
    return { kind: 'ephemeral' };
  }
  if (path.includes('/.bun/install/global/')) {
    return { kind: 'global', manager: 'bun' };
  }
  if (path.includes('/pnpm/global/')) {
    return { kind: 'global', manager: 'pnpm' };
  }
  if (path.includes('/yarn/global/')) {
    return { kind: 'global', manager: 'yarn' };
  }
  if (path.includes('/lib/node_modules/')) {
    return { kind: 'global', manager: 'npm' };
  }
  if (path.includes('/Cellar/')) return { kind: 'brew' };
  return { kind: 'unknown' };
};

/**
 * The global install of `version` with `manager`, as an argv. `name` is the
 * meta package unless the platform package is installed on its own.
 */
export const installArgv = (
  manager: Manager,
  version: string,
  name: string = PACKAGE_NAME,
): string[] => {
  const spec = `${name}@${version}`;
  switch (manager) {
    case 'npm':
      return ['npm', 'install', '-g', spec];
    case 'bun':
      return ['bun', 'add', '-g', spec];
    case 'pnpm':
      return ['pnpm', 'add', '-g', spec];
    case 'yarn':
      return ['yarn', 'global', 'add', spec];
  }
};

/** What to print when the CLI does not run the update itself. */
export const manualCommand = (install: Install, version: string): string =>
  install.kind === 'brew'
    ? `brew upgrade ${PACKAGE_NAME}`
    : installArgv('npm', version).join(' ');

/** What the update left of the service's unit or agent. */
export type UnitState =
  /** It points at a binary that is still there. */
  | 'intact'
  /** It pointed at a removed binary and `install-service` wrote it again. */
  | 'rewritten'
  /** It points at a removed binary and the rewrite did not work. */
  | 'stale';

export interface ServiceRestart {
  /** The command that makes the service manager probe whether it runs. */
  probe: readonly [string, readonly string[]];
  /** The command a person runs to restart it on the new version. */
  restart: string;
}

/**
 * How to tell whether the runner's service is running, and how to restart
 * it. A `stale` unit (the update removed the binary it points at; pnpm keeps
 * each version in its own directory) has to be written again before the
 * restart; a `rewritten` one only has to be loaded.
 */
export const serviceRestart = (
  os: string,
  uid: number,
  launchAgentFile: string,
  unit: UnitState,
): ServiceRestart | null => {
  if (os === 'linux') {
    const restart = `systemctl --user restart ${SERVICE_NAME}`;
    const reload = 'systemctl --user daemon-reload';
    return {
      probe: ['systemctl', ['--user', 'is-active', '--quiet', SERVICE_NAME]],
      restart:
        unit === 'stale'
          ? `${SERVICE_NAME} install-service && ${reload} && ${restart}`
          : unit === 'rewritten'
            ? `${reload} && ${restart}`
            : restart,
    };
  }
  if (os === 'darwin') {
    const target = `gui/${uid}/${LAUNCH_AGENT_LABEL}`;
    const reload = `launchctl bootout ${target} && launchctl bootstrap gui/${uid} ${launchAgentFile}`;
    return {
      probe: ['launchctl', ['print', target]],
      restart:
        unit === 'stale'
          ? `${SERVICE_NAME} install-service && ${reload}`
          : unit === 'rewritten'
            ? reload
            : `launchctl kickstart -k ${target}`,
    };
  }
  return null;
};
