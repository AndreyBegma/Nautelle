import { AUTH_ERROR } from '@nautelle/shared';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { authError } from './auth-error';
import { getAuth } from './auth-request';
import { PROJECT_SCOPED_TOKEN_KEY } from './decorators';

/**
 * C-403: a personal API token limited to projects reaches only routes under
 * `ProjectAccessGuard` — which resolved the project against the token's list
 * and left `projectAccess` on the request — and the few routes marked
 * `@ProjectScopedTokenAllowed()`. Everything else is instance-wide (admin
 * pages, runners, settings, cross-project feeds) and is refused, rather than
 * trusting every such query to honour the list. Runs after every guard.
 */
@Injectable()
export class ApiTokenScopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { projectAccess?: unknown }>();
    const auth = getAuth(request);
    if (
      auth?.user.projectScope &&
      request.projectAccess === undefined &&
      !this.reflector.getAllAndOverride<boolean>(PROJECT_SCOPED_TOKEN_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw authError(
        403,
        AUTH_ERROR.apiTokenProjectScoped,
        'This API token is limited to projects; use a route under /projects/:projectId',
      );
    }
    return next.handle();
  }
}
