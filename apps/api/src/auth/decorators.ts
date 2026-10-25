import type { Role } from '@nautelle/shared';
import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth-request';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const TWO_FACTOR_SETUP_KEY = 'auth:two-factor-setup';
export const BEARER_BODY_KEY = 'auth:bearer-body';

/** Opts a route (or controller) out of the global `SessionGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * ADR-0090: a public route that authenticates with `Authorization: Bearer`
 * and takes a body that is not JSON — the runner's demo video upload. With
 * that header the CSRF guard lets any content type through: a cross-site
 * form cannot set `Authorization`. Without it the route is refused like any
 * non-JSON public request.
 */
export const BearerBody = () => SetMetadata(BEARER_BODY_KEY, true);

/**
 * C-189: open to an admin who still has to set up the two-factor sign-in the
 * instance requires; every other route refuses them until they have.
 */
export const AllowedBeforeTwoFactorSetup = () =>
  SetMetadata(TWO_FACTOR_SETUP_KEY, true);

export const SESSION_ONLY_KEY = 'auth:session-only';

/**
 * C-403: refuses personal API tokens — the route needs a browser session.
 * Used where a token could widen its own reach: tokens themselves, the
 * password, two-factor sign-in, sessions. `SessionOnly(false)` on a handler
 * re-opens it under a session-only controller.
 */
export const SessionOnly = (only = true) =>
  SetMetadata(SESSION_ONLY_KEY, only);

export const PROJECT_SCOPED_TOKEN_KEY = 'auth:project-scoped-token';

/**
 * C-403: opens a route that is not under `ProjectAccessGuard` to a token
 * limited to projects — only for a route that narrows what it returns through
 * `ProjectAccessService` (the project list, the caller).
 */
export const ProjectScopedTokenAllowed = () =>
  SetMetadata(PROJECT_SCOPED_TOKEN_KEY, true);

/** Restricts a route (or controller) to callers holding one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated caller. Only valid on routes behind `SessionGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.user,
);
