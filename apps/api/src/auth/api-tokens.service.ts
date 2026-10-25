import {
  type AdminApiTokenView,
  API_TOKEN_PREFIX,
  type ApiTokenView,
  AUTH_ERROR,
  type CreatedApiToken,
} from '@nautelle/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ApiToken } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { authError } from './auth-error';
import type { AuthContext, AuthUser } from './auth-request';
import type { CreateApiTokenDto } from './dto';
import { generateToken, hashToken } from './tokens';
import { toPublicUser } from './user-mapper';

const LAST_USED_REFRESH_MS = 60_000;
const HINT_LENGTH = API_TOKEN_PREFIX.length + 6;

const notFound = () =>
  authError(404, AUTH_ERROR.notFound, 'API token not found');

/** Whether a header is a personal API token rather than a runner's bearer. */
export const isApiToken = (bearer: string): boolean =>
  bearer.startsWith(API_TOKEN_PREFIX);

/** The bearer token of `Authorization: Bearer <token>`, if any. */
export const bearerOf = (header: string | undefined): string | null => {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match ? match[1] : null;
};

/**
 * C-403: personal API tokens. A token authenticates as its owner, read fresh
 * on every request — a changed role or a disabled account applies at once.
 */
@Injectable()
export class ApiTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    owner: AuthUser,
    dto: CreateApiTokenDto,
    ctx: AuditContext,
  ): Promise<CreatedApiToken> {
    const projectIds = [...new Set(dto.projectIds ?? [])];
    await this.assertVisible(owner, projectIds);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    const token = `${API_TOKEN_PREFIX}${generateToken()}`;
    const row = await this.prisma.apiToken.create({
      data: {
        userId: owner.id,
        name: dto.name.trim(),
        tokenHash: hashToken(token),
        hint: token.slice(0, HINT_LENGTH),
        scope: dto.scope,
        projectIds,
        expiresAt,
      },
    });
    await this.audit.record({
      ...ctx,
      action: 'auth.api_token_create',
      target: { type: 'api_token', id: row.id },
      after: {
        name: row.name,
        scope: row.scope,
        projectIds: row.projectIds,
        expiresAt: row.expiresAt,
      },
      result: 'ok',
    });
    const [view] = await this.views([row]);
    return { ...view, token };
  }

  async listOwn(userId: string): Promise<ApiTokenView[]> {
    return this.views(
      await this.prisma.apiToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listAll(): Promise<AdminApiTokenView[]> {
    const rows = await this.prisma.apiToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });
    const views = await this.views(rows);
    return views.map((view, i) => ({
      ...view,
      userId: rows[i].userId,
      userEmail: rows[i].user.email,
    }));
  }

  /**
   * Revokes a token: the owner's own (`ownerId`), or anyone's for an admin
   * (`ownerId` null). Revoking twice keeps the first revocation.
   */
  async revoke(
    id: string,
    ownerId: string | null,
    by: AuthUser,
    ctx: AuditContext,
  ): Promise<ApiTokenView> {
    const row = await this.prisma.apiToken.findFirst({
      where: { id, ...(ownerId ? { userId: ownerId } : {}) },
    });
    if (!row) throw notFound();
    if (row.revokedAt) return (await this.views([row]))[0];
    const revoked = await this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date(), revokedById: by.id },
    });
    await this.audit.record({
      ...ctx,
      action: 'auth.api_token_revoke',
      target: { type: 'api_token', id },
      before: { name: row.name },
      result: 'ok',
      meta: row.userId === by.id ? undefined : { ownerId: row.userId },
    });
    return (await this.views([revoked]))[0];
  }

  /**
   * The caller behind a bearer token, or null when it is unknown, revoked,
   * expired, or its owner is not active.
   */
  async resolve(token: string, ip?: string): Promise<AuthContext | null> {
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.user.status !== 'active') return null;
    const now = Date.now();
    if (row.expiresAt && row.expiresAt.getTime() <= now) return null;

    if (
      !row.lastUsedAt ||
      now - row.lastUsedAt.getTime() >= LAST_USED_REFRESH_MS ||
      (ip && ip !== row.lastUsedIp)
    ) {
      await this.prisma.apiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date(now), lastUsedIp: ip ?? null },
      });
    }
    return {
      user: {
        ...toPublicUser(row.user),
        ...(row.projectIds.length > 0
          ? { projectScope: row.projectIds }
          : {}),
      },
      sessionId: `api-token:${row.id}`,
      apiToken: {
        id: row.id,
        name: row.name,
        readOnly: row.scope === 'read_only',
      },
    };
  }

  /** A token never reaches a project its owner cannot see (404, as elsewhere). */
  private async assertVisible(
    owner: AuthUser,
    projectIds: string[],
  ): Promise<void> {
    if (projectIds.length === 0) return;
    const visible = await this.prisma.project.count({
      where: {
        id: { in: projectIds },
        ...(owner.role === 'admin'
          ? {}
          : { members: { some: { userId: owner.id } } }),
      },
    });
    if (visible !== projectIds.length) {
      throw authError(404, AUTH_ERROR.notFound, 'Project not found');
    }
  }

  private async views(rows: ApiToken[]): Promise<ApiTokenView[]> {
    const ids = [...new Set(rows.flatMap((row) => row.projectIds))];
    const projects =
      ids.length === 0
        ? []
        : await this.prisma.project.findMany({
            where: { id: { in: ids } },
            select: { id: true, displayName: true },
          });
    const names = new Map(projects.map((p) => [p.id, p.displayName]));
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      projects:
        row.projectIds.length === 0
          ? null
          : row.projectIds.map((id) => ({ id, name: names.get(id) ?? null })),
      hint: row.hint,
      status: row.revokedAt
        ? 'revoked'
        : row.expiresAt && row.expiresAt.getTime() <= now
          ? 'expired'
          : 'active',
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      lastUsedIp: row.lastUsedIp,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  }
}
