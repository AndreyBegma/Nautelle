import type { GitGithubAuth } from '@nautelle/shared/protocol';
import type { Exec } from './detect/exec';

/**
 * #329 D1: what every `git` child gets while `gh` is authenticated for
 * github.com — SSH remotes are read as HTTPS, and HTTPS credentials come
 * from `gh`. The empty helper resets the helpers inherited for
 * `https://github.com` only; any other host keeps the machine's own setup.
 */
export const GITHUB_GIT_CONFIG: readonly (readonly [string, string])[] = [
  ['url.https://github.com/.insteadOf', 'git@github.com:'],
  ['url.https://github.com/.insteadOf', 'ssh://git@github.com/'],
  ['credential.https://github.com.helper', ''],
  ['credential.https://github.com.helper', '!gh auth git-credential'],
];

/**
 * C-126: what every `git` child gets, whatever the auth mode. As `GIT_CONFIG_*`
 * these are command-scope settings, so a repository's or worktree's own
 * `.git/config` cannot override them: no repository hook (`post-checkout` of
 * `worktree add` included), no `core.fsmonitor` program on a collector's
 * `git status`, no local-path submodule clone (`user`, not `never`: a push to a
 * local-path remote is the user's own, a submodule's clone is not), no recursion into submodules.
 */
export const HARDENED_GIT_CONFIG: readonly (readonly [string, string])[] = [
  ['core.hooksPath', '/dev/null'],
  ['core.fsmonitor', 'false'],
  ['protocol.file.allow', 'user'],
  ['submodule.recurse', 'false'],
];

/** `gh auth status` is local: it reads the stored token, nothing slower. */
const PROBE_TIMEOUT_MS = 10_000;

/** C-441 D2: a failing setup does not run `gh` on every fetch. */
const REPROBE_INTERVAL_MS = 30_000;

/** C-441 D1: the `git` subcommands that talk to a remote. */
const REMOTE_COMMANDS: ReadonlySet<string> = new Set([
  'push',
  'fetch',
  'pull',
  'ls-remote',
]);

/** C-441 D1: what git prints when SSH or HTTPS credentials are missing or refused. */
const AUTH_FAILURE =
  /Permission denied \(publickey\)|Host key verification failed|could not read Username|Authentication failed|terminal prompts disabled/i;

/** The subcommand of a `git` call, past `-C <path>` and `-c <key=value>`. */
const subcommand = (args: readonly string[]): string | undefined => {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '-C' || arg === '-c') i += 1;
    else if (!arg.startsWith('-')) return arg;
  }
  return undefined;
};

/**
 * #329 D1: how the runner's git reaches GitHub. The runner runs as a service
 * with no SSH agent, so when `gh` is logged in to github.com, git goes over
 * HTTPS with `gh`'s token; otherwise (`native`) nothing changes.
 *
 * The settings live here and in `wrap` only: call sites stay unchanged.
 */
export class GitAuth {
  private mode: GitGithubAuth = 'native';
  private lastReprobe = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly exec: Exec,
    private readonly now: () => number = Date.now,
  ) {}

  /** The mode the last `probe` found; `native` before the first. */
  get github(): GitGithubAuth {
    return this.mode;
  }

  /** Re-checks `gh auth status --hostname github.com`; never throws. */
  async probe(): Promise<GitGithubAuth> {
    const status = await this.exec(
      'gh',
      ['auth', 'status', '--hostname', 'github.com'],
      { timeoutMs: PROBE_TIMEOUT_MS },
    ).catch(() => null);
    this.mode = status?.code === 0 ? 'gh' : 'native';
    return this.mode;
  }

  /**
   * `exec` with `HARDENED_GIT_CONFIG` added to every `git` call, and
   * `GITHUB_GIT_CONFIG` while the mode is `gh`. Any other binary is passed as is.
   *
   * C-441 D1: a push, fetch, pull or ls-remote that fails on SSH or auth
   * re-probes `gh` (at most every 30 s) and, when the mode changed, runs once
   * more with the new settings. An auth failure happens before any ref is sent,
   * so the retry is safe.
   */
  wrap(exec: Exec): Exec {
    const run: Exec = (binary, args, options) =>
      exec(binary, args, {
        ...options,
        gitConfig: [
          ...(options?.gitConfig ?? []),
          ...HARDENED_GIT_CONFIG,
          ...(this.mode === 'gh' ? GITHUB_GIT_CONFIG : []),
        ],
      });
    return async (binary, args, options) => {
      if (binary !== 'git') return exec(binary, args, options);
      const before = this.mode;
      const result = await run(binary, args, options);
      if (
        !result ||
        result.code === 0 ||
        !REMOTE_COMMANDS.has(subcommand(args) ?? '') ||
        !AUTH_FAILURE.test(result.stderr) ||
        this.now() - this.lastReprobe < REPROBE_INTERVAL_MS
      ) {
        return result;
      }
      this.lastReprobe = this.now();
      const after = await this.probe();
      return after === before ? result : run(binary, args, options);
    };
  }
}
