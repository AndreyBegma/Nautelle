/**
 * C-403: personal API tokens. A token acts as its owner with the owner's
 * current role — never more — and, when `read_only`, only reads.
 */
export const API_TOKEN_SCOPES = ['owner', 'read_only'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Every token starts with it, so a leaked one is recognisable in a scan. */
export const API_TOKEN_PREFIX = 'ntl_';

export const API_TOKEN_NAME_MAX_LENGTH = 80;

/** The most projects one token may be limited to. */
export const API_TOKEN_MAX_PROJECTS = 50;

/** The expiries Account › API tokens offers, in days; null: never. */
export const API_TOKEN_EXPIRY_DAYS = [7, 30, 90, 365, null] as const;

export type ApiTokenStatus = 'active' | 'expired' | 'revoked';

export interface ApiTokenProject {
  id: string;
  /** Null once the project is deleted: the token still never reaches it. */
  name: string | null;
}

export interface ApiTokenView {
  id: string;
  name: string;
  scope: ApiTokenScope;
  /** Null: every project the owner can see. */
  projects: ApiTokenProject[] | null;
  /** The token's first characters, enough to tell two tokens apart. */
  hint: string;
  status: ApiTokenStatus;
  createdAt: string;
  /** Null: never expires. */
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
}

/** `GET /admin/api-tokens`: every user's tokens. */
export interface AdminApiTokenView extends ApiTokenView {
  userId: string;
  userEmail: string;
}

/** `POST /auth/api-tokens`. */
export interface CreateApiTokenRequest {
  name: string;
  scope: ApiTokenScope;
  /** Omitted or empty: every project the owner can see. */
  projectIds?: string[];
  /** ISO instant in the future; omitted or null: never expires. */
  expiresAt?: string | null;
}

/** The token itself is in this response only; only its hash is stored. */
export interface CreatedApiToken extends ApiTokenView {
  token: string;
}
