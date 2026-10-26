'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Field, Input } from '@andrewbehma/glass-ui/field';
import {
  AUTH_ERROR,
  FORGOT_PASSWORD_PAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordResetCheckRequest,
  type PasswordResetCheckResponse,
  type PasswordResetRequest,
  type PasswordResetResponse,
  passwordResetTokenOf,
} from '@nautelle/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '../../components/auth-card';
import { ApiError, api, describeError } from '../../lib/api';

type LinkState =
  | { status: 'checking' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; token: string; link: PasswordResetCheckResponse };

const INVALID_LINK =
  'This reset link has expired or was already used. Ask for a new one.';

/**
 * C-402 (ADR-0113): redeems a one-time reset link. The token is in the
 * fragment, so it is read here and never sent in a page request.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<LinkState>({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = passwordResetTokenOf(window.location.hash);
    if (token === null) {
      setState({ status: 'invalid', message: INVALID_LINK });
      return;
    }
    const body: PasswordResetCheckRequest = { token };
    api<PasswordResetCheckResponse>('/auth/password-reset/check', {
      method: 'POST',
      body,
    })
      .then((link) => setState({ status: 'ready', token, link }))
      .catch((err: unknown) =>
        setState({ status: 'invalid', message: describeError(err) }),
      );
  }, []);

  if (state.status === 'checking') return null;

  if (state.status === 'invalid') {
    return (
      <AuthCard title="Link not valid" description={state.message}>
        <Link
          href={FORGOT_PASSWORD_PAGE}
          className={buttonClassName({ variant: 'solid', full: true })}
        >
          Get a new link
        </Link>
        <Link
          href="/login"
          className={buttonClassName({ variant: 'glass', full: true })}
        >
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  const { token, link } = state;
  const resetsTwoFactor = link.kind === 'two_factor';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const body: PasswordResetRequest = link.codeRequired
        ? { token, newPassword: password, code }
        : { token, newPassword: password };
      await api<PasswordResetResponse>('/auth/password-reset', {
        method: 'POST',
        body,
      });
      // Drop the token from the address bar and the history entry.
      window.history.replaceState(null, '', window.location.pathname);
      router.replace(resetsTwoFactor ? '/account' : '/');
    } catch (err) {
      if (err instanceof ApiError && err.code === AUTH_ERROR.resetLinkInvalid) {
        setState({ status: 'invalid', message: describeError(err) });
        return;
      }
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={resetsTwoFactor ? 'Reset password and 2FA' : 'Set a new password'}
      description={
        resetsTwoFactor
          ? `For ${link.email}. Two-factor sign-in is turned off; set it up again on your account page after this.`
          : `For ${link.email}. Your other sessions are signed out.`
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="New password"
          htmlFor="new-password"
          required
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="Repeat password"
          htmlFor="repeat-password"
          required
          error={link.codeRequired ? undefined : error}
        >
          <Input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </Field>
        {link.codeRequired ? (
          <Field
            label="Authentication code"
            htmlFor="code"
            required
            hint="Your account has two-factor sign-in: the six digits from your authenticator app, or one of your recovery codes."
            error={error}
          >
            <Input
              id="code"
              autoComplete="one-time-code"
              required
              maxLength={64}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        ) : null}
        <Button type="submit" variant="solid" full disabled={busy}>
          {busy ? 'Saving…' : 'Set password and sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
