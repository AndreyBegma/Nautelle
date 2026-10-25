import {
  TOOL_USE_TIMEOUT_DEFAULT_MINUTES,
  TOOL_USE_TIMEOUT_MAX_MINUTES,
  TOOL_USE_TIMEOUT_MIN_MINUTES,
  type ToolRuleView,
} from '@nautelle/shared';
import { ApiError, describeError } from '../api';

/**
 * C-401: the tool-use request timeout field. Empty means "not set" (null):
 * the account's setting applies, else five minutes. Undefined when the text
 * is not a whole number of minutes in range; the API validates too.
 */
export const parseTimeoutMinutes = (
  text: string,
): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const minutes = Number(trimmed);
  return minutes >= TOOL_USE_TIMEOUT_MIN_MINUTES &&
    minutes <= TOOL_USE_TIMEOUT_MAX_MINUTES
    ? minutes
    : undefined;
};

/** The sentence under the field, or undefined when the value is fine. */
export const timeoutError = (text: string): string | undefined =>
  parseTimeoutMinutes(text) === undefined
    ? `Enter whole minutes from ${TOOL_USE_TIMEOUT_MIN_MINUTES} to ${TOOL_USE_TIMEOUT_MAX_MINUTES} (12 hours), or leave it empty.`
    : undefined;

/** "5 minutes", "1 hour", "2 hours 30 minutes". */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (hours === 0) return part(rest, 'minute');
  return rest === 0
    ? part(hours, 'hour')
    : `${part(hours, 'hour')} ${part(rest, 'minute')}`;
};

/** The hint under the project's field. */
export const TIMEOUT_DEFAULT_TEXT = `When empty, the account setting of the person who runs the session applies, else ${formatMinutes(TOOL_USE_TIMEOUT_DEFAULT_MINUTES)}.`;

/** The hint under the account's field. */
export const ACCOUNT_TIMEOUT_TEXT = `When empty, ${formatMinutes(TOOL_USE_TIMEOUT_DEFAULT_MINUTES)}. A project's own timeout comes first.`;

/** "Session rule", "Project rule". */
export const SCOPE_LABEL: Record<ToolRuleView['scope'], string> = {
  session: 'Session',
  project: 'Project',
};

/** Project rules first, then the newest. */
export const sortToolRules = (rules: readonly ToolRuleView[]): ToolRuleView[] =>
  [...rules].sort(
    (a, b) =>
      (a.scope === b.scope ? 0 : a.scope === 'project' ? -1 : 1) ||
      b.createdAt.localeCompare(a.createdAt),
  );

export function describeToolRuleError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Only operators of this project can remove a rule.';
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'This rule was already removed.';
  }
  return describeError(error);
}
