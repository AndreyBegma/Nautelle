import { z } from 'zod';

/**
 * Tool-use rules (C-401, ADR-0102): a person answering a remote `tool_use`
 * request may allow every similar call for the rest of the session, or for
 * the project from now on. A rule is Claude Code's own permission rule shape
 * — `Bash(npm test:*)` is `{ toolName: 'Bash', ruleContent: 'npm test:*' }` —
 * taken from the hook's `addRules` suggestion when it has one. The API keeps
 * the rules and answers a later request from them; Claude Code never learns
 * them, so every call still reaches the API and is checked and audited.
 *
 * A dangerous call is never remembered and never answered by a rule:
 * destructive shell, pushes that may reach a protected branch, and reading
 * secrets or credential files (`toolUseDanger`).
 */

export const TOOL_RULE_TOOL_NAME_MAX = 200;
export const TOOL_RULE_CONTENT_MAX = 500;
/** At most this many suggested rules ride on one request. */
export const TOOL_USE_SUGGESTIONS_MAX = 10;

export const toolRuleSchema = z.strictObject({
  toolName: z.string().min(1).max(TOOL_RULE_TOOL_NAME_MAX),
  ruleContent: z.string().min(1).max(TOOL_RULE_CONTENT_MAX).optional(),
});
export type ToolRule = z.infer<typeof toolRuleSchema>;

/** `session`: the rest of the request's session; `project`: until removed. */
export const toolRuleScopeSchema = z.enum(['session', 'project']);
export type ToolRuleScope = z.infer<typeof toolRuleScopeSchema>;
export const TOOL_RULE_SCOPES = toolRuleScopeSchema.options;

/** A stored rule as `GET …/tool-rules` lists it. */
export interface ToolRuleView extends ToolRule {
  id: string;
  scope: ToolRuleScope;
  sessionId: string | null;
  /** `toolRuleLabel` of the rule. */
  label: string;
  createdById: string | null;
  createdByEmail: string | null;
  /** The request whose answer made it. */
  sourceRequestId: string | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

/** A rule as Claude Code writes it: `Bash(npm test:*)`, or the tool alone. */
export const toolRuleLabel = (rule: ToolRule): string =>
  rule.ruleContent === undefined
    ? rule.toolName
    : `${rule.toolName}(${rule.ruleContent})`;

export const sameToolRule = (a: ToolRule, b: ToolRule): boolean =>
  a.toolName === b.toolName && a.ruleContent === b.ruleContent;

// ─── The request timeout ────────────────────────────────────────────────────

/** How long a `tool_use` request waits when nothing is set (spec 201 D18). */
export const TOOL_USE_TIMEOUT_DEFAULT_MINUTES = 5;
export const TOOL_USE_TIMEOUT_MIN_MINUTES = 1;
/** Twelve hours: a night away. The hook's own timeout is set above it. */
export const TOOL_USE_TIMEOUT_MAX_MINUTES = 12 * 60;

export const isToolUseTimeoutMinutes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= TOOL_USE_TIMEOUT_MIN_MINUTES &&
  value <= TOOL_USE_TIMEOUT_MAX_MINUTES;

/**
 * A `tool_use` request's timeout: the project's setting, else the
 * requester's account setting, else five minutes. A stored value outside the
 * range is ignored.
 */
export const toolUseTimeoutMinutes = (settings: {
  project?: number | null;
  account?: number | null;
}): number => {
  if (isToolUseTimeoutMinutes(settings.project)) return settings.project;
  if (isToolUseTimeoutMinutes(settings.account)) return settings.account;
  return TOOL_USE_TIMEOUT_DEFAULT_MINUTES;
};

/**
 * The `PermissionRequest` hook's timeout in Claude Code's settings, in
 * seconds: the longest request timeout plus five minutes, so the hook gives
 * the answer — or gives up — before Claude Code kills it.
 */
export const PERMISSION_HOOK_TIMEOUT_S =
  TOOL_USE_TIMEOUT_MAX_MINUTES * 60 + 300;

// ─── The call ───────────────────────────────────────────────────────────────

/** What a rule and the danger check read of a `tool_use` request. */
export interface ToolUseCall {
  toolName: string;
  /** The redacted tool input, parsed; null when it was not a JSON object. */
  input: Record<string, unknown> | null;
}

/**
 * The call a `tool_use` request's args describe, or null when it cannot be
 * judged: no preview, or only head and tail of a longer input — the omitted
 * middle may hold anything, so such a call is never remembered or matched.
 */
export const toolUseCallOf = (args: {
  toolName: string;
  input?: string;
  truncated?: boolean;
  preview?: 'none';
}): ToolUseCall | null => {
  if (args.preview === 'none' || args.truncated === true) return null;
  if (args.input === undefined) return null;
  let input: unknown;
  try {
    input = JSON.parse(args.input);
  } catch {
    return null;
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  return { toolName: args.toolName, input: input as Record<string, unknown> };
};

const stringField = (
  input: Record<string, unknown> | null,
  key: string,
): string | null => {
  const value = input?.[key];
  return typeof value === 'string' ? value : null;
};

// ─── Dangerous calls ────────────────────────────────────────────────────────

export type ToolUseDangerKind =
  | 'destructive_shell'
  | 'protected_push'
  | 'secret_read';

export interface ToolUseDanger {
  kind: ToolUseDangerKind;
  /** One line for the person: why this call always asks. */
  reason: string;
}

/** Branches a push may never reach through a remembered rule. */
export const PROTECTED_BRANCHES: readonly string[] = [
  'main',
  'master',
  'develop',
  'development',
  'trunk',
  'production',
  'prod',
  'staging',
  'release',
];

const isProtectedBranch = (branch: string): boolean => {
  const name = branch.replace(/^refs\/heads\//, '');
  return (
    PROTECTED_BRANCHES.includes(name) ||
    /^(?:release|hotfix)[/-]/.test(name) ||
    // `HEAD` is whatever is checked out: possibly a protected branch.
    name === 'HEAD' ||
    name === '@'
  );
};

/** Example files that hold no secrets: `.env.example` and the like. */
const ENV_EXAMPLE = /^\.env\.(?:example|sample|template|dist|defaults)$/i;

/**
 * Paths that hold secrets or credentials. Matched against a path with `\`
 * turned into `/`, case-insensitively, anywhere in a shell word.
 */
const SECRET_PATHS: readonly RegExp[] = [
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?!\.pub)(?:$|[^\w.])/i,
  /(?:^|\/)\.aws\/(?:credentials|config)$/i,
  /(?:^|\/)\.(?:netrc|npmrc|pypirc|git-credentials|pgpass|my\.cnf)$/i,
  /(?:^|\/)\.docker\/config\.json$/i,
  /(?:^|\/)\.kube\/config$/i,
  /(?:^|\/)\.gnupg(?:\/|$)/i,
  /(?:^|\/)\.config\/gh\/hosts\.ya?ml$/i,
  /(?:^|\/)\.config\/gcloud(?:\/|$)/i,
  /(?:^|\/)\.azure(?:\/|$)/i,
  /(?:^|\/)\.credentials\.json$/i,
  /(?:^|\/)credentials(?:\.json|\.ya?ml)?$/i,
  /(?:^|\/)secrets?(?:\.json|\.ya?ml|\.toml)$/i,
  /(?:^|\/)service[-_]?account[^/]*\.json$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx)$/i,
  /(?:^|\/)nautelle\/runner\.json$/i,
  /^\/etc\/(?:shadow|gshadow|sudoers)$/i,
];

/** Whether a path (or a shell word holding one) names a secret. */
export const isSecretPath = (raw: string): boolean => {
  const path = raw.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (/^\.env(?:\..+)?$/i.test(base) && !ENV_EXAMPLE.test(base)) return true;
  return SECRET_PATHS.some((pattern) => pattern.test(path));
};

/** Shell operators: a command holding one runs more than one program. */
const SHELL_OPERATOR = /[;&|<>`\n\r]|\$\(/;

/** A command that is one program with its arguments, nothing chained. */
export const isSimpleShellCommand = (command: string): boolean =>
  command.trim().length > 0 && !SHELL_OPERATOR.test(command);

/** The commands of a shell line, split at operators and substitutions. */
const shellSegments = (command: string): string[][] =>
  command
    .split(/&&|\|\||[;&|\n\r`]|\$\(|\)/)
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0),
    )
    .filter((words) => words.length > 0);

/** Words that run the program after them. */
const WRAPPERS = new Set([
  'env',
  'command',
  'builtin',
  'exec',
  'nohup',
  'time',
  'nice',
  'xargs',
]);

/**
 * The program and its arguments, past leading `VAR=value` and wrappers
 * (`env`, `nohup`, `xargs` …). A bare `env` — which prints the environment —
 * leaves no words.
 */
const programWords = (words: string[]): string[] => {
  let i = 0;
  while (
    i < words.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '') ||
      WRAPPERS.has(words[i] ?? ''))
  ) {
    i += 1;
  }
  return words.slice(i);
};

const PIPE_TO_INTERPRETER =
  /\|\s*(?:sudo\s+)?(?:\S*\/)?(?:sh|bash|zsh|dash|ksh|fish|python3?|node|bun|deno|perl|ruby|php)\b/;

const hasFlag = (words: string[], short: string, long: string): boolean =>
  words.some(
    (w) =>
      w === long ||
      w.startsWith(`${long}=`) ||
      (/^-[A-Za-z]+$/.test(w) && w.includes(short)),
  );

const destructiveShell = (words: string[]): string | null => {
  const [program, ...rest] = words;
  const name = program?.slice(program.lastIndexOf('/') + 1) ?? '';
  if (name === 'sudo' || name === 'su' || name === 'doas') {
    return 'runs a command as another user';
  }
  if (
    name === 'rm' &&
    (hasFlag(rest, 'r', '--recursive') || hasFlag(rest, 'R', '--recursive'))
  ) {
    return 'deletes recursively (rm -r)';
  }
  if (['dd', 'mkfs', 'shred', 'wipefs', 'fdisk', 'parted'].includes(name)) {
    return `writes disks or destroys files (${name})`;
  }
  if (name.startsWith('mkfs.')) return `formats a disk (${name})`;
  if (
    (name === 'chmod' || name === 'chown' || name === 'chgrp') &&
    hasFlag(rest, 'R', '--recursive')
  ) {
    return `changes permissions recursively (${name} -R)`;
  }
  if (
    name === 'find' &&
    rest.some((w) => w === '-delete' || w === '-exec' || w === '-execdir')
  ) {
    return 'deletes or runs commands on found files (find -delete/-exec)';
  }
  if (name === 'git') {
    const sub = rest.find((w) => !w.startsWith('-'));
    if (sub === 'reset' && rest.includes('--hard')) {
      return 'throws away uncommitted work (git reset --hard)';
    }
    if (sub === 'clean' && hasFlag(rest, 'f', '--force')) {
      return 'deletes untracked files (git clean -f)';
    }
    if (sub === 'checkout' && (rest.includes('--') || rest.includes('.'))) {
      return 'throws away uncommitted changes (git checkout --)';
    }
    if (sub === 'restore' && !rest.includes('--staged')) {
      return 'throws away uncommitted changes (git restore)';
    }
    if (
      sub === 'branch' &&
      (rest.includes('-D') ||
        (hasFlag(rest, 'd', '--delete') && hasFlag(rest, 'f', '--force')))
    ) {
      return 'deletes a branch (git branch -D)';
    }
    if (sub === 'stash' && (rest.includes('drop') || rest.includes('clear'))) {
      return 'drops stashed work (git stash drop/clear)';
    }
    if (sub === 'filter-branch' || sub === 'filter-repo') {
      return `rewrites history (git ${sub})`;
    }
  }
  if (name === 'gh') {
    const [area, verb] = rest.filter((w) => !w.startsWith('-'));
    if (area === 'pr' && verb === 'merge') {
      return 'merges a pull request into its base branch (gh pr merge)';
    }
    if ((area === 'repo' || area === 'release') && verb === 'delete') {
      return `deletes a ${area} (gh ${area} delete)`;
    }
  }
  if (rest.includes('migrate') && rest.includes('reset')) {
    return 'resets a database (migrate reset)';
  }
  if (rest.includes('--force-reset'))
    return 'resets a database (--force-reset)';
  if (
    name === 'docker' &&
    rest.some((w) => w === 'prune' || w === 'rm' || w === 'rmi')
  ) {
    return 'deletes containers, images or volumes (docker prune/rm)';
  }
  return null;
};

/** The `git push` of a command's words, as a reason, when it may hit a protected branch. */
const pushDanger = (words: string[]): string | null => {
  const [program, ...rest] = words;
  if (program?.slice(program.lastIndexOf('/') + 1) !== 'git') return null;
  // `git -C dir push …`: options with a value come before the subcommand.
  let i = 0;
  while (i < rest.length && rest[i]?.startsWith('-')) {
    i += ['-C', '-c', '--git-dir', '--work-tree'].includes(rest[i] ?? '')
      ? 2
      : 1;
  }
  if (rest[i] !== 'push') return null;
  const args = rest.slice(i + 1);
  const options = args.filter((a) => a.startsWith('-'));
  if (
    options.some(
      (o) =>
        o === '--force' ||
        o.startsWith('--force-with-lease') ||
        o === '--force-if-includes' ||
        o === '--mirror' ||
        o === '--delete' ||
        o === '--all' ||
        o === '--prune' ||
        (/^-[A-Za-z]+$/.test(o) && (o.includes('f') || o.includes('d'))),
    )
  ) {
    return 'force-pushes, deletes or mirrors remote branches';
  }
  // `-o <option>` / `--repo <url>` take a value; anything else is positional.
  const positional: string[] = [];
  for (let j = 0; j < args.length; j += 1) {
    const arg = args[j] ?? '';
    if (arg === '-o' || arg === '--push-option' || arg === '--repo') {
      j += 1;
      continue;
    }
    if (!arg.startsWith('-')) positional.push(arg);
  }
  const refspecs = positional.slice(1);
  if (refspecs.length === 0) {
    return 'pushes without naming a branch: the target may be protected';
  }
  for (const refspec of refspecs) {
    if (refspec.startsWith('+') || refspec.startsWith(':')) {
      return 'force-pushes or deletes a remote branch';
    }
    const target = refspec.includes(':')
      ? refspec.slice(refspec.indexOf(':') + 1)
      : refspec;
    if (isProtectedBranch(target)) {
      return `pushes to a protected branch (${target})`;
    }
  }
  return null;
};

const SHELL_TOOLS = new Set(['Bash', 'BashOutput', 'PowerShell']);

/** Tools whose path arguments are known; any other tool's strings are all read. */
const PATH_KEYS: Record<string, readonly string[]> = {
  Read: ['file_path'],
  Edit: ['file_path'],
  MultiEdit: ['file_path'],
  Write: ['file_path'],
  NotebookEdit: ['notebook_path'],
  NotebookRead: ['notebook_path'],
  Grep: ['path', 'glob', 'pattern'],
  Glob: ['path', 'pattern'],
  LS: ['path'],
  WebFetch: [],
  WebSearch: [],
  TodoWrite: [],
  Task: [],
};

const strings = (value: unknown, depth = 0): string[] => {
  if (typeof value === 'string') return [value];
  if (depth > 4 || typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap((v) => strings(v, depth + 1));
};

/**
 * Why a call must always ask a person, or null. Checked before a rule is
 * remembered and before a rule answers a call, so no rule — however broad
 * — lets one of these through (C-401).
 */
export const toolUseDanger = (call: ToolUseCall): ToolUseDanger | null => {
  if (SHELL_TOOLS.has(call.toolName)) {
    const command = stringField(call.input, 'command') ?? '';
    for (const segment of shellSegments(command)) {
      const words = programWords(segment);
      const push = pushDanger(words);
      if (push) return { kind: 'protected_push', reason: push };
      const destructive = destructiveShell(words);
      if (destructive) {
        return { kind: 'destructive_shell', reason: destructive };
      }
      if (
        (words.length === 0 && segment.includes('env')) ||
        words[0] === 'printenv'
      ) {
        return {
          kind: 'secret_read',
          reason: 'prints the environment, which may hold secrets',
        };
      }
    }
    // A shell fed by a pipe (`curl … | sh`) runs whatever came down it.
    if (PIPE_TO_INTERPRETER.test(command)) {
      return {
        kind: 'destructive_shell',
        reason: 'pipes into a shell or interpreter',
      };
    }
    if (shellSegments(command).flat().some(isSecretPath)) {
      return {
        kind: 'secret_read',
        reason: 'touches a secret or credential file',
      };
    }
    return null;
  }
  const keys = PATH_KEYS[call.toolName];
  const values =
    keys === undefined
      ? strings(call.input)
      : keys
          .map((key) => stringField(call.input, key))
          .filter((v): v is string => v !== null);
  if (values.some((v) => v.split(/[\s,{}]+/).some(isSecretPath))) {
    return {
      kind: 'secret_read',
      reason: 'touches a secret or credential file',
    };
  }
  return null;
};

// ─── Matching ───────────────────────────────────────────────────────────────

/** Bash rule content that names a prefix: `npm test:*` or `npm test *`. */
const shellPrefix = (content: string): string | null =>
  content.endsWith(':*') || content.endsWith(' *')
    ? content.slice(0, -2).trim()
    : null;

const normalizeCommand = (command: string): string =>
  command.trim().replace(/\s+/g, ' ');

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Whether a rule covers a call, by a subset of Claude Code's own rule
 * semantics: a tool-wide rule; for a shell, one exact command or a word
 * prefix (`npm test:*` covers `npm test` and `npm test -- x`, never
 * `npm testing`), and only for a command with no shell operators; for
 * `WebFetch`, `domain:<host>`. Any other rule content covers only a call
 * Claude Code itself suggests the same rule for (`toolRuleAllowing`).
 */
export const toolRuleMatches = (rule: ToolRule, call: ToolUseCall): boolean => {
  if (rule.toolName !== call.toolName) return false;
  const shell = SHELL_TOOLS.has(call.toolName);
  if (rule.ruleContent === undefined) return !shell;
  if (shell) {
    const command = stringField(call.input, 'command');
    if (command === null || !isSimpleShellCommand(command)) return false;
    const line = normalizeCommand(command);
    const prefix = shellPrefix(rule.ruleContent);
    if (prefix === null) return line === normalizeCommand(rule.ruleContent);
    const words = normalizeCommand(prefix);
    return words.length > 0 && (line === words || line.startsWith(`${words} `));
  }
  if (call.toolName === 'WebFetch' && rule.ruleContent.startsWith('domain:')) {
    const host = hostOf(stringField(call.input, 'url') ?? '');
    return host !== null && host === rule.ruleContent.slice(7).toLowerCase();
  }
  return false;
};

/**
 * The stored rule that answers a call, or null and a person decides. Never
 * for a call that cannot be judged (`toolUseCallOf`), a dangerous one, or a
 * chained shell command. Otherwise a rule that covers the call
 * (`toolRuleMatches`), or — when Claude Code suggested rules for this call —
 * every suggested rule already stored: the call is of a kind the person
 * allowed in Claude Code's own terms.
 */
export const toolRuleAllowing = <R extends ToolRule>(
  rules: readonly R[],
  call: ToolUseCall | null,
  suggestions: readonly ToolRule[] = [],
): R | null => {
  if (call === null || toolUseDanger(call) !== null) return null;
  if (
    SHELL_TOOLS.has(call.toolName) &&
    !isSimpleShellCommand(stringField(call.input, 'command') ?? '')
  ) {
    return null;
  }
  const covering = rules.find((rule) => toolRuleMatches(rule, call));
  if (covering) return covering;
  if (suggestions.length === 0) return null;
  const stored = suggestions.map((s) => rules.find((r) => sameToolRule(r, s)));
  return stored.every((r) => r !== undefined) ? (stored[0] ?? null) : null;
};

// ─── Remembering ────────────────────────────────────────────────────────────

/** Programs that run whatever their arguments say: never a one-word prefix rule. */
const RUNS_ANYTHING = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'fish',
  'python',
  'python3',
  'node',
  'bun',
  'bunx',
  'deno',
  'npx',
  'pnpx',
  'perl',
  'ruby',
  'php',
  'eval',
  'exec',
  'env',
  'xargs',
  'sudo',
  'ssh',
  'docker',
  'kubectl',
]);

/** A rule that would allow far more than the call it came from. */
const tooBroad = (rule: ToolRule): boolean => {
  if (!SHELL_TOOLS.has(rule.toolName)) {
    return rule.ruleContent !== undefined && /^[*/]*$/.test(rule.ruleContent);
  }
  if (rule.ruleContent === undefined || /^[\s*:]*$/.test(rule.ruleContent)) {
    return true;
  }
  const prefix = shellPrefix(rule.ruleContent);
  if (prefix === null) return false;
  const words = normalizeCommand(prefix).split(' ');
  return (
    words[0] === '' ||
    words[0] === '*' ||
    (words.length === 1 && RUNS_ANYTHING.has(words[0] ?? ''))
  );
};

/** The rule for a call Claude Code suggested none for: the call itself. */
const derivedRules = (call: ToolUseCall): ToolRule[] => {
  if (SHELL_TOOLS.has(call.toolName)) {
    const command = stringField(call.input, 'command');
    if (command === null || !isSimpleShellCommand(command)) return [];
    const line = normalizeCommand(command);
    return line.length <= TOOL_RULE_CONTENT_MAX
      ? [{ toolName: call.toolName, ruleContent: line }]
      : [];
  }
  if (call.toolName === 'WebFetch') {
    const host = hostOf(stringField(call.input, 'url') ?? '');
    return host
      ? [{ toolName: 'WebFetch', ruleContent: `domain:${host}` }]
      : [];
  }
  return [{ toolName: call.toolName }];
};

export type ToolRuleOffer =
  | { ok: true; rules: ToolRule[] }
  | { ok: false; reason: string };

/**
 * What answering a call with "allow similar" or "always allow" would store:
 * Claude Code's suggested rules when it sent some, else a rule for the call
 * itself — or why nothing may be remembered. A dangerous call, one that
 * cannot be judged, or a rule that would allow a whole shell or interpreter
 * is never remembered.
 */
export const rememberableToolRules = (
  call: ToolUseCall | null,
  suggestions: readonly ToolRule[] = [],
): ToolRuleOffer => {
  if (call === null) {
    return {
      ok: false,
      reason: 'Only part of the call is shown, so it is not remembered',
    };
  }
  const danger = toolUseDanger(call);
  if (danger) return { ok: false, reason: `Always asks: ${danger.reason}` };
  const rules: ToolRule[] = [];
  for (const rule of suggestions.length > 0
    ? suggestions
    : derivedRules(call)) {
    if (!rules.some((r) => sameToolRule(r, rule))) rules.push(rule);
  }
  if (rules.length === 0) {
    return { ok: false, reason: 'No rule describes a chained command' };
  }
  const broad = rules.find(tooBroad);
  if (broad) {
    return {
      ok: false,
      reason: `${toolRuleLabel(broad)} would allow far more than this call`,
    };
  }
  return { ok: true, rules };
};

/**
 * The `addRules` allow suggestions of a `PermissionRequest` hook input's
 * `permission_suggestions`, as rules. Anything else Claude Code suggests —
 * a mode, a directory, a deny — is not a rule and is dropped.
 */
export const toolRulesOfSuggestions = (suggestions: unknown): ToolRule[] => {
  if (!Array.isArray(suggestions)) return [];
  const rules: ToolRule[] = [];
  for (const suggestion of suggestions) {
    if (
      typeof suggestion !== 'object' ||
      suggestion === null ||
      (suggestion as { type?: unknown }).type !== 'addRules' ||
      (suggestion as { behavior?: unknown }).behavior !== 'allow'
    ) {
      continue;
    }
    const listed = (suggestion as { rules?: unknown }).rules;
    for (const raw of Array.isArray(listed) ? listed : []) {
      const parsed = toolRuleSchema.safeParse(
        typeof raw === 'object' && raw !== null
          ? {
              toolName: (raw as { toolName?: unknown }).toolName,
              ...((raw as { ruleContent?: unknown }).ruleContent !== undefined
                ? {
                    ruleContent: (raw as { ruleContent?: unknown }).ruleContent,
                  }
                : {}),
            }
          : raw,
      );
      if (parsed.success && !rules.some((r) => sameToolRule(r, parsed.data))) {
        rules.push(parsed.data);
      }
    }
  }
  return rules.slice(0, TOOL_USE_SUGGESTIONS_MAX);
};
