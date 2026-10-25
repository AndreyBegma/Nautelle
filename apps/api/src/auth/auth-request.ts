import type { PublicUser } from '@nautelle/shared';
import type { Request } from 'express';

export type AuthUser = PublicUser & {
  /**
   * C-403: set when the caller is a personal API token limited to these
   * projects; `ProjectAccessService` then sees no other project. Absent: the
   * owner's projects, as for a browser session.
   */
  projectScope?: readonly string[];
};

/** C-403: the personal API token a request authenticated with. */
export interface ApiTokenAuth {
  id: string;
  name: string;
  readOnly: boolean;
}

export interface AuthContext {
  user: AuthUser;
  /** A browser session's id; `api-token:<id>` for a token, which has none. */
  sessionId: string;
  apiToken?: ApiTokenAuth;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

export const getAuth = (request: Request): AuthContext | undefined =>
  (request as Partial<AuthenticatedRequest>).auth;
