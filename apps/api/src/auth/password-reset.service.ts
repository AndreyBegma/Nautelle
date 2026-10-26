import {
  ADMIN_RESET_LINK_TTL_MS,
  AUTH_ERROR,
  EMAIL_RESET_LINK_TTL_MS,
  type PasswordResetCheckResponse,
  type PasswordResetKind,
  type PasswordResetLinkResponse,
  type PasswordResetVia,
  type PublicUser,
  passwordResetPath,
} from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { PasswordResetLink, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  ANONYMOUS_ACTOR,
  type AuditContext,
  type RequestOrigin,
  SYSTEM_ACTOR,
  userActor,
} from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { authError, sourceThrottled } from './auth-error';
import type { PasswordResetDto } from './dto';
import { LoginThrottle } from './login-throttle';
import { LoginThrottleAlerts } from './login-throttle-alerts';
import { hashPassword } from './password';
import { type IssuedSession, SessionService } from './session.service';
import { generateToken, hashToken } from './tokens';
import { TwoFactorService } from './two-factor.service';
import { toPublicUser } from './user-mapper';

/**
 * Throttle keys on the login counter (ADR-0048). Each Forgot password request
 * counts against the address as typed, so one source cannot flood one inbox;
 * each unknown, used or expired token counts against the source, so links
 * cannot be guessed. Neither key is an email, so neither delays a sign-in.
 */
export const resetRequestKey = (email: string): string =>
  `password-reset:${email}`;
export const RESET_LINK_KEY = 'password-reset-link';

/** At most one emailed link per account this often, however often it is asked for. */
export const EMAIL_RESET_COOLDOWN_MS = 60_000;

const linkInvalid = () =>
  authError(
    410,
    AUTH_ERROR.resetLinkInvalid,
    'This reset link is not valid any more; ask for a new one',
  );

type LinkWithUser = PasswordResetLink & { user: User };

export interface PasswordResetResult {
  user: PublicUser;
  session: IssuedSession;
}

/**
 * C-402 (ADR-0113): one-time links that set a new password — made by an admin
 * in Admin › Users, or emailed by Forgot password when SMTP and `APP_URL` are
 * set. Only the token's SHA-256 is stored; a link works once, before it
 * expires, and redeeming it ends every other session of the account.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly throttle: LoginThrottle,
    private readonly alerts: LoginThrottleAlerts,
    private readonly twoFactor: TwoFactorService,
    private readonly mail: MailService,
  ) {}

  /** Forgot password sends links: SMTP is set, and `APP_URL` to link to. */
  get selfService(): boolean {
    return this.mail.configured && this.mail.appUrl !== null;
  }

  /**
   * An admin's link for another account. `two_factor` also turns two-factor
   * sign-in off when it is redeemed, so it needs an account that has it on.
   */
  async issueByAdmin(
    userId: string,
    kind: PasswordResetKind,
    adminId: string,
    ctx: AuditContext,
  ): Promise<PasswordResetLinkResponse> {
    if (userId === adminId) {
      throw authError(
        403,
        AUTH_ERROR.forbidden,
        'Change your own password and two-factor sign-in under Account',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw authError(404, AUTH_ERROR.notFound, 'User not found');
    return this.issueAdminLink(user, kind, adminId, ctx);
  }

  /**
   * C-484: a link for an active admin, asked for by the operator of the
   * server through `admin:recover` — the way back in for the only admin, who
   * has no other admin to ask. Anyone else is refused, so it is no back door
   * into ordinary accounts. Access to the API container is the authority; the
   * record's actor is the system.
   */
  async issueByCli(
    email: string,
    kind: PasswordResetKind,
  ): Promise<PasswordResetLinkResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) throw authError(404, AUTH_ERROR.notFound, 'User not found');
    if (user.role !== 'admin') {
      throw authError(
        403,
        AUTH_ERROR.forbidden,
        'Not an admin account; use Admin › Users for other accounts',
      );
    }
    return this.issueAdminLink(
      user,
      kind,
      null,
      { actor: SYSTEM_ACTOR },
      {
        via: 'cli',
      },
    );
  }

  private async issueAdminLink(
    user: User,
    kind: PasswordResetKind,
    createdById: string | null,
    ctx: AuditContext,
    meta: object = {},
  ): Promise<PasswordResetLinkResponse> {
    if (user.status !== 'active') {
      throw authError(
        409,
        AUTH_ERROR.invalidTransition,
        `Not allowed for a ${user.status} account`,
      );
    }
    if (kind === 'two_factor' && !user.totpEnabledAt) {
      throw authError(
        409,
        AUTH_ERROR.twoFactorNotEnabled,
        'Two-factor sign-in is off for this user; give a password reset link',
      );
    }
    const token = generateToken();
    const link = await this.prisma.$transaction((tx) =>
      insertLink(tx, token, {
        userId: user.id,
        kind,
        via: 'admin',
        createdById,
        ttlMs: ADMIN_RESET_LINK_TTL_MS,
      }),
    );
    await this.audit.record({
      ...ctx,
      action: 'user.reset_link',
      target: { type: 'user', id: user.id },
      after: { kind, expiresAt: link.expiresAt },
      result: 'ok',
      meta: { linkId: link.id, ...meta },
    });
    return {
      kind,
      path: passwordResetPath(token),
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  /**
   * Forgot password. The answer is the same whether the address has an
   * account or not, and the email goes out after the response, so neither
   * the body nor the time taken says which addresses exist.
   */
  async request(email: string, origin: RequestOrigin): Promise<void> {
    if (!this.selfService) {
      throw authError(
        409,
        AUTH_ERROR.passwordResetUnavailable,
        'This server sends no email; ask an administrator for a reset link',
      );
    }
    const key = resetRequestKey(email);
    const wait = await this.throttle.waitMs(key, origin.ip);
    if (wait > 0) throw sourceThrottled(wait);
    await this.throttle.fail(key, origin.ip);
    // Against the email, never the account: the record tells an auditor no
    // more than the response told the caller.
    await this.audit.recordFolded({
      actor: ANONYMOUS_ACTOR,
      origin,
      action: 'auth.password_reset_request',
      target: { type: 'email', id: email },
      result: 'ok',
    });
    void this.emailLink(email).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`password reset email not sent: ${reason}`);
    });
  }

  /** What redeeming a link needs, before the person types a new password. */
  async check(
    token: string,
    origin: RequestOrigin,
  ): Promise<PasswordResetCheckResponse> {
    const link = await this.usableLink(token, origin);
    return {
      email: link.user.email,
      kind: link.kind,
      codeRequired: needsCode(link),
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  /**
   * Sets the new password, spends the link, ends every session of the account
   * and signs the person in. A `password` link on an account with two-factor
   * sign-in also needs a code, on the login counter; a `two_factor` link turns
   * two-factor sign-in off, so the person sets it up again.
   */
  async redeem(
    dto: PasswordResetDto,
    origin: RequestOrigin,
  ): Promise<PasswordResetResult> {
    const link = await this.usableLink(dto.token, origin);
    const { user } = link;
    if (needsCode(link)) await this.checkCode(user, dto.code, origin);

    const passwordHash = await hashPassword(dto.newPassword);
    const resetsTwoFactor =
      link.kind === 'two_factor' && user.totpEnabledAt !== null;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Spent here, not when it was checked: of two redeems racing, one wins.
      const { count } = await tx.passwordResetLink.updateMany({
        where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw linkInvalid();
      await tx.passwordResetLink.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      if (resetsTwoFactor) {
        await tx.userRecoveryCode.deleteMany({ where: { userId: user.id } });
      }
      return tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          ...(resetsTwoFactor
            ? {
                totpSecret: null,
                totpPendingSecret: null,
                totpEnabledAt: null,
                totpLastStep: null,
              }
            : {}),
        },
      });
    });
    await this.throttle.clear(user.email, origin.ip);
    const session = await this.sessions.create(user.id, origin);
    await this.audit.record({
      actor: userActor(user.id),
      origin,
      action: 'auth.password_reset',
      target: { type: 'user', id: user.id },
      ...(resetsTwoFactor
        ? {
            before: { twoFactorEnabled: true },
            after: { twoFactorEnabled: false },
          }
        : {}),
      result: 'ok',
      meta: {
        kind: link.kind,
        via: link.via,
        linkId: link.id,
        sessionId: session.sessionId,
      },
    });
    return { user: toPublicUser(updated), session };
  }

  /**
   * The link behind `token` while it can still be used, for an active account.
   * Anything else — unknown, used, expired, a disabled account — is one 410
   * and one failure on the source's counter.
   */
  private async usableLink(
    token: string,
    origin: RequestOrigin,
  ): Promise<LinkWithUser> {
    const wait = await this.throttle.waitMs(RESET_LINK_KEY, origin.ip);
    if (wait > 0) throw sourceThrottled(wait);
    const link = await this.prisma.passwordResetLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const usable =
      link !== null &&
      link.usedAt === null &&
      link.expiresAt.getTime() > Date.now() &&
      link.user.status === 'active';
    if (!usable) {
      await this.throttle.fail(RESET_LINK_KEY, origin.ip);
      await this.audit.recordFolded({
        actor: ANONYMOUS_ACTOR,
        origin,
        action: 'auth.password_reset',
        target: { type: 'reset_link', id: link?.id ?? null },
        result: 'denied',
        meta: { reason: AUTH_ERROR.resetLinkInvalid },
      });
      throw linkInvalid();
    }
    return link;
  }

  /** The second factor, on the login counter (C-109), so a link guesses no faster. */
  private async checkCode(
    user: User,
    code: string | undefined,
    origin: RequestOrigin,
  ): Promise<void> {
    if (!code) {
      throw authError(
        401,
        AUTH_ERROR.twoFactorRequired,
        'Enter the code from your authenticator app',
      );
    }
    const wait = await this.throttle.waitMs(user.email, origin.ip);
    if (wait > 0) throw sourceThrottled(wait);
    if (await this.twoFactor.verify(user, code)) return;
    const at = new Date();
    const { failures, accountThrottled } = await this.throttle.fail(
      user.email,
      origin.ip,
      at,
    );
    if (accountThrottled) {
      await this.alerts.accountThrottled({
        userId: user.id,
        email: user.email,
        ip: origin.ip,
        failures,
        at,
      });
    }
    throw authError(
      401,
      AUTH_ERROR.twoFactorInvalid,
      'The code is wrong, expired or already used',
    );
  }

  /** Runs after the response: an active account gets a link, at most once a minute. */
  private async emailLink(email: string): Promise<void> {
    const appUrl = this.mail.appUrl;
    if (!appUrl) return;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') return;
    const token = generateToken();
    const created = await this.prisma.$transaction(async (tx) => {
      // Under a lock per account, so a burst of requests makes one link.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${user.id}`}))`;
      const recent = await tx.passwordResetLink.count({
        where: {
          userId: user.id,
          via: 'email',
          createdAt: { gt: new Date(Date.now() - EMAIL_RESET_COOLDOWN_MS) },
        },
      });
      if (recent > 0) return false;
      await insertLink(tx, token, {
        userId: user.id,
        kind: 'password',
        via: 'email',
        createdById: null,
        ttlMs: EMAIL_RESET_LINK_TTL_MS,
      });
      return true;
    });
    if (!created) return;
    await this.mail.send({
      to: user.email,
      subject: 'Reset your Nautelle password',
      text: [
        'Someone asked to reset the password of your Nautelle account.',
        '',
        'Set a new password here (the link works once, for an hour):',
        `${appUrl}${passwordResetPath(token)}`,
        '',
        'If it was not you, ignore this email: your password stays as it is.',
      ].join('\n'),
    });
  }
}

interface NewLink {
  userId: string;
  kind: PasswordResetKind;
  via: PasswordResetVia;
  createdById: string | null;
  ttlMs: number;
}

/**
 * Stores `token`'s hash as a new link. It replaces the account's unused links
 * of the same origin — a stranger asking for emails never voids the link an
 * admin handed over. Expired rows of anyone go too.
 */
const insertLink = async (
  tx: Prisma.TransactionClient,
  token: string,
  { userId, kind, via, createdById, ttlMs }: NewLink,
): Promise<PasswordResetLink> => {
  const now = Date.now();
  await tx.passwordResetLink.deleteMany({
    where: {
      OR: [{ userId, via, usedAt: null }, { expiresAt: { lt: new Date(now) } }],
    },
  });
  return tx.passwordResetLink.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      kind,
      via,
      createdById,
      createdAt: new Date(now),
      expiresAt: new Date(now + ttlMs),
    },
  });
};

const needsCode = (link: LinkWithUser): boolean =>
  link.kind === 'password' && link.user.totpEnabledAt !== null;
