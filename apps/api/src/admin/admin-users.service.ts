import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUser,
  type AdminUsersPage,
  AUTH_ERROR,
  type Role,
  USER_STATUSES,
} from '@nautelle/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, User, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuditContext, SYSTEM_ACTOR } from '../audit/audit.types';
import { authError } from '../auth/auth-error';
import { TwoFactorService } from '../auth/two-factor.service';
import { toAdminUser } from '../auth/user-mapper';
import { PrismaService } from '../database/prisma.service';
import type { UpdateUserDto } from './dto';

type Tx = Prisma.TransactionClient;

const notFound = () => authError(404, AUTH_ERROR.notFound, 'User not found');
const invalidTransition = (from: UserStatus) =>
  authError(
    409,
    AUTH_ERROR.invalidTransition,
    `Not allowed for a ${from} account`,
  );

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /**
   * `ADMIN_USERS_PAGE_SIZE` a page: pending oldest first (who waited longest),
   * every other status newest first. The cursor is the last row's `createdAt`
   * and id, so a row deleted between two pages cannot end the list. `counts`
   * ignores `q`, so the tabs always show totals.
   */
  async list(
    filters: { status?: UserStatus; q?: string; cursor?: string } = {},
  ): Promise<AdminUsersPage> {
    const q = filters.q?.trim();
    const oldestFirst = filters.status === 'pending';
    const dir = oldestFirst ? 'asc' : 'desc';
    const beyond = oldestFirst ? 'gt' : 'lt';
    const after = filters.cursor ? parseCursor(filters.cursor) : undefined;
    const clauses: Prisma.UserWhereInput[] = [];
    if (filters.status) clauses.push({ status: filters.status });
    if (q) {
      clauses.push({
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (after) {
      clauses.push({
        OR: [
          { createdAt: { [beyond]: after.createdAt } },
          { createdAt: after.createdAt, id: { [beyond]: after.id } },
        ],
      });
    }
    const [rows, grouped] = await Promise.all([
      this.prisma.user.findMany({
        where: { AND: clauses },
        orderBy: [{ createdAt: dir }, { id: dir }],
        take: ADMIN_USERS_PAGE_SIZE + 1,
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const page = rows.slice(0, ADMIN_USERS_PAGE_SIZE);
    const last = page[page.length - 1];
    const counts = Object.fromEntries(
      USER_STATUSES.map((status) => [
        status,
        grouped.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as AdminUsersPage['counts'];
    return {
      items: page.map(toAdminUser),
      nextCursor:
        rows.length > ADMIN_USERS_PAGE_SIZE && last
          ? `${last.createdAt.toISOString()}_${last.id}`
          : null,
      counts,
    };
  }

  /** Approval sets the status and the role in one action (spec D4). */
  async approve(
    id: string,
    role: Role,
    adminId: string,
    ctx: AuditContext,
  ): Promise<AdminUser> {
    const [before, updated] = await this.prisma.$transaction(async (tx) => {
      const user = await this.lockUser(tx, id);
      if (user.status !== 'pending') throw invalidTransition(user.status);
      const changed = await tx.user.update({
        where: { id },
        data: {
          status: 'active',
          role,
          approvedById: adminId,
          approvedAt: new Date(),
        },
      });
      return [user, changed] as const;
    });
    await this.audit.record({
      ...ctx,
      action: 'user.approve',
      target: { type: 'user', id },
      before: { status: before.status, role: before.role },
      after: { status: updated.status, role: updated.role },
      result: 'ok',
    });
    return toAdminUser(updated);
  }

  async reject(id: string, ctx: AuditContext): Promise<AdminUser> {
    const [before, updated] = await this.prisma.$transaction(async (tx) => {
      const user = await this.lockUser(tx, id);
      if (user.status !== 'pending') throw invalidTransition(user.status);
      const changed = await tx.user.update({
        where: { id },
        data: { status: 'rejected' },
      });
      return [user, changed] as const;
    });
    await this.audit.record({
      ...ctx,
      action: 'user.reject',
      target: { type: 'user', id },
      before: { status: before.status },
      after: { status: updated.status },
      result: 'ok',
    });
    return toAdminUser(updated);
  }

  /**
   * Role and active/disabled changes for approved accounts. Disabling or
   * changing the role ends every session of that user (spec D11); the last
   * active admin cannot be demoted or disabled (spec D10).
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    // A call from outside a request (a job, a script) acts as the system.
    ctx: AuditContext = { actor: SYSTEM_ACTOR },
  ): Promise<AdminUser> {
    if (dto.role === undefined && dto.status === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const [before, updated] = await this.prisma.$transaction(async (tx) => {
      await lockAdminSet(tx);
      const user = await this.lockUser(tx, id);
      if (user.status !== 'active' && user.status !== 'disabled') {
        throw invalidTransition(user.status);
      }
      const role = dto.role ?? user.role;
      const status = dto.status ?? user.status;
      const losesAdmin =
        isActiveAdmin(user) && !(role === 'admin' && status === 'active');
      if (losesAdmin) await this.assertNotLastAdmin(tx);

      const changed = await tx.user.update({
        where: { id },
        data: { role, status },
      });
      if (role !== user.role || status !== user.status) {
        await tx.userSession.deleteMany({ where: { userId: id } });
      }
      return [user, changed] as const;
    });
    // Only the fields that changed (spec "Retrofit").
    const fields = (['role', 'status'] as const).filter(
      (field) => before[field] !== updated[field],
    );
    await this.audit.record({
      ...ctx,
      action: 'user.update',
      target: { type: 'user', id },
      before: Object.fromEntries(fields.map((f) => [f, before[f]])),
      after: Object.fromEntries(fields.map((f) => [f, updated[f]])),
      result: 'ok',
    });
    return toAdminUser(updated);
  }

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      await lockAdminSet(tx);
      const user = await this.lockUser(tx, id);
      if (isActiveAdmin(user)) await this.assertNotLastAdmin(tx);
      await tx.user.delete({ where: { id } });
      return user;
    });
    await this.audit.record({
      ...ctx,
      action: 'user.delete',
      target: { type: 'user', id },
      before: {
        email: removed.email,
        role: removed.role,
        status: removed.status,
      },
      result: 'ok',
    });
  }

  /**
   * C-189: turns off another account's two-factor sign-in, for a person who
   * lost both the authenticator and the recovery codes. Never one's own: that
   * takes the password and a code (`POST /auth/me/two-factor/disable`).
   */
  async resetTwoFactor(
    id: string,
    adminId: string,
    ctx: AuditContext,
  ): Promise<AdminUser> {
    if (id === adminId) {
      throw authError(
        403,
        AUTH_ERROR.forbidden,
        'Turn off your own two-factor sign-in under Account, with a code',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    if (!user.totpEnabledAt) {
      throw authError(
        409,
        AUTH_ERROR.twoFactorNotEnabled,
        'Two-factor sign-in is already off for this user',
      );
    }
    await this.twoFactor.disable(id);
    await this.audit.record({
      ...ctx,
      action: 'user.two_factor_reset',
      target: { type: 'user', id },
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
      result: 'ok',
    });
    return toAdminUser({ ...user, totpEnabledAt: null });
  }

  private async lockUser(tx: Tx, id: string): Promise<User> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) throw notFound();
    return tx.user.findUniqueOrThrow({ where: { id } });
  }

  /** Only meaningful under `lockAdminSet`. */
  private async assertNotLastAdmin(tx: Tx): Promise<void> {
    const admins = await tx.user.count({
      where: { role: 'admin', status: 'active' },
    });
    if (admins <= 1) {
      throw authError(
        409,
        AUTH_ERROR.lastAdmin,
        'The last active admin cannot be demoted, disabled or deleted',
      );
    }
  }
}

/**
 * Serialises every change that can take away an active admin (spec D10). Row
 * locks alone deadlock when two admins demote each other — each holds its
 * target and waits for the other — so one transaction-scoped advisory lock
 * orders them instead: the second sees the first's result and gets 409.
 */
const lockAdminSet = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agentdock:admin-set'))`;

function parseCursor(cursor: string): { createdAt: Date; id: string } {
  const split = cursor.indexOf('_');
  const createdAt = new Date(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  if (split < 0 || !id || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('Invalid cursor');
  }
  return { createdAt, id };
}

const isActiveAdmin = (user: User): boolean =>
  user.role === 'admin' && user.status === 'active';
