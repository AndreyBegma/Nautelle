import type { PublicUser } from './contracts';

/**
 * C-402 (ADR-0113): what a reset link resets. `password`: a new password; an
 * account with two-factor sign-in still proves it with a code. `two_factor`:
 * a new password, and two-factor sign-in is turned off so the person sets it
 * up again — only an admin gives this kind.
 */
export const PASSWORD_RESET_KINDS = ['password', 'two_factor'] as const;
export type PasswordResetKind = (typeof PASSWORD_RESET_KINDS)[number];

/** Where a reset link came from: Admin › Users, or Forgot password by email. */
export const PASSWORD_RESET_VIAS = ['admin', 'email'] as const;
export type PasswordResetVia = (typeof PASSWORD_RESET_VIAS)[number];

/** An admin's link lasts a day: it is handed over by hand. */
export const ADMIN_RESET_LINK_TTL_MS = 24 * 60 * 60_000;
/** An emailed link lasts an hour. */
export const EMAIL_RESET_LINK_TTL_MS = 60 * 60_000;

/** The web page that redeems a link. */
export const PASSWORD_RESET_PAGE = '/reset-password';
/** The web page that asks for a link by email. */
export const FORGOT_PASSWORD_PAGE = '/forgot-password';

/**
 * The path of a reset link. The token is in the fragment, so it never reaches
 * a server log or a `Referer` header.
 */
export const passwordResetPath = (token: string): string =>
  `${PASSWORD_RESET_PAGE}#token=${encodeURIComponent(token)}`;

/** The token in a reset link's fragment (`#token=…`), or null. */
export const passwordResetTokenOf = (hash: string): string | null =>
  new URLSearchParams(hash.replace(/^#/, '')).get('token') || null;

/** `POST /admin/users/:id/reset-link`. */
export interface CreatePasswordResetLinkRequest {
  kind: PasswordResetKind;
}

/** The link, shown to the admin once; only its hash is stored. */
export interface PasswordResetLinkResponse {
  kind: PasswordResetKind;
  /** `passwordResetPath(token)`; the web page prefixes its own origin. */
  path: string;
  expiresAt: string;
}

/** `GET /auth/password-reset`: what the sign-in page offers. */
export interface PasswordResetOptions {
  /** SMTP and `APP_URL` are set, so Forgot password sends a link by email. */
  selfService: boolean;
}

/** `POST /auth/password-reset/request`. */
export interface ForgotPasswordRequest {
  email: string;
}

/** `POST /auth/password-reset/check`. */
export interface PasswordResetCheckRequest {
  token: string;
}

/** A link that can still be used, and what redeeming it needs. */
export interface PasswordResetCheckResponse {
  email: string;
  kind: PasswordResetKind;
  /** A `password` link on an account with two-factor sign-in needs a code too. */
  codeRequired: boolean;
  expiresAt: string;
}

/** `POST /auth/password-reset`: redeems the link and signs the person in. */
export interface PasswordResetRequest {
  token: string;
  newPassword: string;
  /** A code from the authenticator app or a recovery code, when `codeRequired`. */
  code?: string;
}

export type PasswordResetResponse = PublicUser;
