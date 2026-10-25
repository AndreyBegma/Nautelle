import type { ApiTokenScope, ApiTokenStatus } from '@nautelle/shared';

/** C-403: what each scope lets a token do, as Account › API tokens says it. */
export const SCOPE_LABEL: Record<ApiTokenScope, string> = {
  owner: 'Your rights',
  read_only: 'Read-only',
};

export const STATUS_TONE: Record<ApiTokenStatus, 'ok' | 'warn' | 'neutral'> = {
  active: 'ok',
  expired: 'warn',
  revoked: 'neutral',
};

export const STATUS_LABEL: Record<ApiTokenStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** An expiry preset: a number of days from now, or `never`. */
export type ExpiryChoice = `${number}` | 'never';

export const expiryLabel = (choice: ExpiryChoice): string =>
  choice === 'never' ? 'Never' : choice === '365' ? '1 year' : `${choice} days`;

/** The `expiresAt` a preset sends: `days` after `now`, or null for never. */
export const expiresAtFor = (
  choice: ExpiryChoice,
  now: Date = new Date(),
): string | null =>
  choice === 'never'
    ? null
    : new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();

/** The `curl` line shown with a new token, to try it at once. */
export const curlExample = (apiUrl: string, token: string): string =>
  `curl -H 'Authorization: Bearer ${token}' ${apiUrl.replace(/\/$/, '')}/projects`;
