import { describe, expect, test } from 'bun:test';
import type { AdminUser } from '@nautelle/shared';
import { closedGate, probeGate } from '../../../components/confirm/gate-probe';
import { type Confirmation, confirmationCopy } from './confirmation';

const user = { id: 'u1', email: 'ann@example.com' } as AdminUser;

describe('Approve a pending user (C-166)', () => {
  test('the title names the role being granted', () => {
    const gate = probeGate<Confirmation>(confirmationCopy, {
      user,
      action: 'approve',
      role: 'admin',
    });
    expect(gate.dialog.title).toBe('Approve ann@example.com as Admin?');
    expect(gate.dialog.verb).toBe('Approve');
    // An admin grant puts the focus on Cancel.
    expect(gate.dialog.tone).toBe('danger');
    expect(
      probeGate<Confirmation>(confirmationCopy, {
        user,
        action: 'approve',
        role: 'viewer',
      }).dialog.title,
    ).toBe('Approve ann@example.com as Viewer?');
  });

  test('the approval runs only after Approve, never on Cancel', () => {
    const pending: Confirmation = { user, action: 'approve', role: 'admin' };
    const cancelled = probeGate(confirmationCopy, pending);
    cancelled.cancel();
    expect(cancelled.confirmed).toEqual([]);
    expect(cancelled.cancelled()).toBe(1);

    const confirmed = probeGate(confirmationCopy, pending);
    confirmed.confirm();
    expect(confirmed.confirmed).toEqual([pending]);
  });

  test('a click that only asks draws nothing until something is pending', () => {
    const gate = closedGate(confirmationCopy);
    expect(gate.element).toBeNull();
    expect(gate.calls()).toBe(0);
  });
});

describe('Reset links from Admin › Users (C-402)', () => {
  test('Reset 2FA asks first, names the account and runs only after Create link', () => {
    const pending: Confirmation = { user, action: 'reset_two_factor' };
    const gate = probeGate<Confirmation>(confirmationCopy, pending);
    expect(gate.dialog.title).toBe('Create a 2FA reset link?');
    expect(gate.dialog.verb).toBe('Create link');
    expect(gate.dialog.consequence).toContain('ann@example.com');
    expect(gate.dialog.consequence).toContain('turns off two-factor sign-in');
    gate.confirm();
    expect(gate.confirmed).toEqual([pending]);
  });

  test('Reset password says a 2FA account still needs its code', () => {
    const plain = probeGate<Confirmation>(confirmationCopy, {
      user,
      action: 'reset_password',
    });
    expect(plain.dialog.title).toBe('Create a password reset link?');
    expect(plain.dialog.consequence).toContain('24 hours');
    expect(plain.dialog.consequence).not.toContain('authenticator');
    const withTwoFactor = probeGate<Confirmation>(confirmationCopy, {
      user: { ...user, twoFactorEnabled: true },
      action: 'reset_password',
    });
    expect(withTwoFactor.dialog.consequence).toContain(
      'they still need their authenticator code',
    );
  });
});
