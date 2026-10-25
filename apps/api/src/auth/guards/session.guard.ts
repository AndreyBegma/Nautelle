import { AUTH_ERROR, SESSION_COOKIE } from '@nautelle/shared';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiTokensService, bearerOf, isApiToken } from '../api-tokens.service';
import { authError } from '../auth-error';
import type { AuthContext, AuthenticatedRequest } from '../auth-request';
import {
  IS_PUBLIC_KEY,
  SESSION_ONLY_KEY,
  TWO_FACTOR_SETUP_KEY,
} from '../decorators';
import { SessionService } from '../session.service';
import { TwoFactorService } from '../two-factor.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global: every route needs an active session unless it is `@Public()`. An
 * admin without the two-factor sign-in the instance requires (C-189) gets only
 * the routes marked `@AllowedBeforeTwoFactorSetup()`.
 *
 * C-403: `Authorization: Bearer ntl_…` authenticates with a personal API
 * token instead. It is refused on `@SessionOnly()` routes, and a read-only
 * token on every method that is not a read.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly apiTokens: ApiTokensService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const bearer = bearerOf(request.get('authorization'));
    const auth =
      bearer && isApiToken(bearer)
        ? await this.fromApiToken(context, request, bearer)
        : await this.fromSession(request);
    (request as AuthenticatedRequest).auth = auth;

    if (
      !auth.user.twoFactorEnabled &&
      !this.reflector.getAllAndOverride<boolean>(TWO_FACTOR_SETUP_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) &&
      (await this.twoFactor.requiredFor(auth.user))
    ) {
      throw authError(
        403,
        AUTH_ERROR.twoFactorSetupRequired,
        'Set up two-factor sign-in under Account first: this server requires it for administrators',
      );
    }
    return true;
  }

  private async fromSession(request: Request): Promise<AuthContext> {
    const cookies = request.cookies as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE];
    const auth = token ? await this.sessions.resolve(token) : null;
    if (!auth) {
      throw authError(401, AUTH_ERROR.unauthenticated, 'Not signed in');
    }
    return auth;
  }

  private async fromApiToken(
    context: ExecutionContext,
    request: Request,
    token: string,
  ): Promise<AuthContext> {
    const auth = await this.apiTokens.resolve(token, request.ip);
    if (!auth?.apiToken) {
      throw authError(
        401,
        AUTH_ERROR.unauthenticated,
        'The API token is unknown, expired or revoked',
      );
    }
    const sessionOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      SESSION_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (sessionOnly) {
      throw authError(
        403,
        AUTH_ERROR.apiTokenNotAllowed,
        'This needs a signed-in browser session, not an API token',
      );
    }
    if (auth.apiToken.readOnly && !SAFE_METHODS.has(request.method)) {
      throw authError(
        403,
        AUTH_ERROR.apiTokenReadOnly,
        'This API token is read-only',
      );
    }
    return auth;
  }
}
