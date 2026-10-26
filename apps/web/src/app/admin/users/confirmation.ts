import type { AdminUser, Role } from '@nautelle/shared';
import type { ConfirmCopy } from '../../../components/confirm/confirm-gate';
import {
  approveCopy,
  deleteUserCopy,
  roleChangeCopy,
} from '../../../lib/users/format';

/** An action on the Users page that waits for its confirmation. */
export type Confirmation =
  | {
      user: AdminUser;
      action:
        | 'reject'
        | 'disable'
        | 'delete'
        | 'reset_password'
        | 'reset_two_factor';
    }
  | { user: AdminUser; action: 'role' | 'approve'; role: Role };

const CONFIRM_COPY: Record<
  'reject' | 'disable' | 'delete' | 'reset_password' | 'reset_two_factor',
  { title: string; verb: string; text: (u: AdminUser) => string }
> = {
  reject: {
    title: 'Reject this registration?',
    verb: 'Reject',
    text: (u) =>
      `${u.email} will not be able to sign in or register again until you delete the account.`,
  },
  disable: {
    title: 'Disable this account?',
    verb: 'Disable',
    text: (u) =>
      `${u.email} will be signed out everywhere immediately. Everything they own stays; Enable brings the account back.`,
  },
  delete: {
    title: 'Delete this account?',
    verb: 'Delete',
    text: deleteUserCopy,
  },
  // C-402 (ADR-0113): both resets give a one-time link, nothing changes until it is used.
  reset_password: {
    title: 'Create a password reset link?',
    verb: 'Create link',
    text: (u) =>
      `You get a one-time link for ${u.email} that expires in 24 hours. Using it sets a new password and signs them out everywhere else${u.twoFactorEnabled ? '; they still need their authenticator code' : ''}. Do this only once you know it is really them asking.`,
  },
  reset_two_factor: {
    title: 'Create a 2FA reset link?',
    verb: 'Create link',
    text: (u) =>
      `You get a one-time link for ${u.email} that expires in 24 hours. Using it sets a new password and turns off two-factor sign-in until they set it up again; their authenticator key and recovery codes stop working. Do this only once you know it is really them asking.`,
  },
};

export function confirmationCopy(confirm: Confirmation): ConfirmCopy {
  if (confirm.action === 'approve') {
    return approveCopy(confirm.user, confirm.role);
  }
  if (confirm.action === 'role') {
    const copy = roleChangeCopy(confirm.user, confirm.role);
    return {
      title: copy.title,
      consequence: copy.text,
      verb: copy.verb,
      tone: 'default',
    };
  }
  const copy = CONFIRM_COPY[confirm.action];
  return {
    title: copy.title,
    consequence: copy.text(confirm.user),
    verb: copy.verb,
  };
}
