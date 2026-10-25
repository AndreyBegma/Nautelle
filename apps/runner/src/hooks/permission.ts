import {
  ACTION_REQUEST_HOOK_WAIT_MS,
  ACTION_REQUEST_POLL_MS,
  ACTION_REQUEST_SLOW_POLL_MS,
  ACTION_REQUEST_SUMMARY_MAX,
  type ActionRequestSummary,
  PERMISSION_HOOK_TIMEOUT_S,
  type ToolRule,
} from '@nautelle/shared';
import type { LocalErrorCode } from '@nautelle/shared/protocol';
import type { LocalClient } from '../local/client';

/**
 * The `PermissionRequest` hook's output (spec 201 D17), as documented under
 * "PermissionRequest decision control" at https://code.claude.com/docs/en/hooks
 * (read 2026-10-14): `hookSpecificOutput.decision.behavior` is `allow` or
 * `deny`; `message` is for `deny` only and tells Claude why. Printing
 * nothing leaves the permission flow unchanged: the local dialog shows.
 */
export type PermissionDecision =
  | { behavior: 'allow' }
  | { behavior: 'deny'; message: string };

export const permissionOutput = (decision: PermissionDecision): string =>
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision },
  });

/** The deny message when the approver left no note. */
export const DEFAULT_DENY_MESSAGE = 'Denied remotely in Nautelle.';

/** Polling errors in a row after which the hook gives up and the dialog shows. */
export const MAX_POLL_FAILURES = 3;

const TRANSIENT: ReadonlySet<LocalErrorCode> = new Set([
  'runner_offline',
  'timeout',
  'internal',
]);

export interface PermissionDeps {
  client: LocalClient;
  cwd: string;
  sessionId: string;
  toolName: string;
  /** The raw tool input; the daemon redacts it and keeps head and tail (C-114). */
  toolInput?: string;
  /** C-401: Claude Code's `addRules` allows for this call, if it made any. */
  suggestions?: readonly ToolRule[];
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * The raw tool input the hook hands the daemon, at most: well above the
 * shown budget, since the daemon redacts, hashes, then keeps head and tail
 * (C-114), and well inside the local socket's line limit.
 */
export const PERMISSION_TOOL_INPUT_MAX = 32 * 1024;

/**
 * The raw tool input within `PERMISSION_TOOL_INPUT_MAX`: an input above it
 * keeps its head and its tail, so the end of a long command still reaches
 * the person (C-114).
 */
export const clipToolInput = (
  raw: string | undefined,
  max = PERMISSION_TOOL_INPUT_MAX,
): string | undefined => {
  if (raw === undefined || raw.length <= max) return raw;
  const marker = (omitted: number) =>
    `\n… [${omitted} characters omitted by the hook] …\n`;
  const half = Math.floor((max - marker(raw.length).length) / 2);
  return `${raw.slice(0, half)}${marker(raw.length - 2 * half)}${raw.slice(raw.length - half)}`;
};

/**
 * The longest the hook polls one request: its hook timeout less a minute, so
 * it answers before Claude Code kills it.
 */
export const PERMISSION_WAIT_MAX_MS = (PERMISSION_HOOK_TIMEOUT_S - 60) * 1000;

/**
 * How long a request waits (C-401): until it expires, read off the API's
 * own clock — `createdAt` to `expiresAt` — so a skewed local clock neither
 * cuts the wait short nor stretches it. The default without either.
 */
export const waitMsOf = (request: ActionRequestSummary): number => {
  const ttl = Date.parse(request.expiresAt) - Date.parse(request.createdAt);
  if (!Number.isFinite(ttl) || ttl <= 0) return ACTION_REQUEST_HOOK_WAIT_MS;
  return Math.min(ttl, PERMISSION_WAIT_MAX_MS);
};

const summaryFor = (toolName: string): string =>
  `Allow ${toolName} in an unattended Claude Code session`.slice(
    0,
    ACTION_REQUEST_SUMMARY_MAX,
  );

const decisionOf = (
  request: ActionRequestSummary,
): PermissionDecision | 'wait' | null => {
  switch (request.status) {
    case 'approved':
    case 'executed':
      return { behavior: 'allow' };
    case 'denied':
      return {
        behavior: 'deny',
        message: request.note?.trim() || DEFAULT_DENY_MESSAGE,
      };
    case 'pending':
      return 'wait';
    case 'expired':
    case 'failed':
      return null;
  }
};

/**
 * Away mode (D17): files a `tool_use` action request and polls its status
 * until it expires — every `ACTION_REQUEST_POLL_MS` for the first
 * `ACTION_REQUEST_HOOK_WAIT_MS`, every `ACTION_REQUEST_SLOW_POLL_MS` after
 * (C-401: a project may wait hours). Approved — by a person or a stored
 * rule — → allow; denied → deny with the note; expired, offline, or no
 * answer in time → null, and the local dialog shows.
 */
export const awaitRemoteDecision = async (
  deps: PermissionDeps,
): Promise<PermissionDecision | null> => {
  const context = {
    via: 'hook' as const,
    cwd: deps.cwd,
    sessionId: deps.sessionId,
  };
  const created = await deps.client.request(
    'action.request',
    {
      kind: 'tool_use',
      args: {
        toolName: deps.toolName,
        ...(deps.toolInput ? { input: clipToolInput(deps.toolInput) } : {}),
        ...(deps.suggestions?.length
          ? { suggestions: [...deps.suggestions] }
          : {}),
      },
      summary: summaryFor(deps.toolName),
    },
    context,
  );
  if (!created.ok) return null;
  const first = decisionOf(created.data);
  if (first !== 'wait') return first;

  const start = deps.now();
  const deadline = start + waitMsOf(created.data);
  const interval = () =>
    deps.now() - start < ACTION_REQUEST_HOOK_WAIT_MS
      ? ACTION_REQUEST_POLL_MS
      : ACTION_REQUEST_SLOW_POLL_MS;
  let failures = 0;
  while (deps.now() + interval() <= deadline) {
    await deps.sleep(interval());
    const status = await deps.client.request(
      'action.status',
      { id: created.data.id },
      context,
    );
    if (!status.ok) {
      if (!TRANSIENT.has(status.error.code)) return null;
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) return null;
      continue;
    }
    failures = 0;
    const decision = decisionOf(status.data);
    if (decision !== 'wait') return decision;
  }
  return null;
};
