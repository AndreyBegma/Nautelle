import type { AuditAction, AuditResult } from '@nautelle/shared';

/**
 * Who did it (spec D5). `anonymous`: no session — failed logins, registration.
 * `system.onBehalfOf`: the user the system acted for — a schedule's or a
 * trigger's creator when it fires (#102).
 */
export type AuditActor =
  | { type: 'user'; userId: string }
  | { type: 'runner'; runnerId: string }
  | { type: 'system'; onBehalfOf?: string }
  | { type: 'anonymous' };

/** Where a request came from — merged into `meta` (spec D9). */
export interface RequestOrigin {
  ip?: string;
  userAgent?: string;
  /**
   * C-403: the personal API token the request came with — written to
   * `meta.apiToken`, so the record reads "<owner> via token <name>".
   */
  apiToken?: { id: string; name: string };
}

/** The caller of a request, as `@AuditCtx()` resolves it. */
export interface AuditContext {
  actor: AuditActor;
  origin?: RequestOrigin;
}

export interface AuditEntry extends AuditContext {
  action: AuditAction;
  target: { type: string; id?: string | null };
  projectId?: string | null;
  /** Plain objects; Dates become ISO strings, secrets are redacted (D7). */
  before?: object;
  after?: object;
  result: AuditResult;
  meta?: object;
}

export const SYSTEM_ACTOR: AuditActor = { type: 'system' };
export const ANONYMOUS_ACTOR: AuditActor = { type: 'anonymous' };

export const userActor = (userId: string): AuditActor => ({
  type: 'user',
  userId,
});

/** The system, acting for `userId`. */
export const systemActorFor = (userId: string): AuditActor => ({
  type: 'system',
  onBehalfOf: userId,
});
