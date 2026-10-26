'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Field, Input } from '@andrewbehma/glass-ui/field';
import type {
  ForgotPasswordRequest,
  PasswordResetOptions,
} from '@nautelle/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { AuthCard } from '../../components/auth-card';
import { api, describeError } from '../../lib/api';

const backToSignIn = (
  <Link
    href="/login"
    className={buttonClassName({ variant: 'glass', full: true })}
  >
    Back to sign in
  </Link>
);

/**
 * C-402 (ADR-0113): asks for a reset link by email. The answer is the same
 * whether or not the address has an account.
 */
export default function ForgotPasswordPage() {
  const [selfService, setSelfService] = useState<boolean>();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PasswordResetOptions>('/auth/password-reset')
      .then((options) => setSelfService(options.selfService))
      .catch(() => setSelfService(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const body: ForgotPasswordRequest = { email: email.trim() };
      await api<void>('/auth/password-reset/request', {
        method: 'POST',
        body,
      });
      setSentTo(body.email);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (selfService === undefined) return null;

  if (!selfService) {
    return (
      <AuthCard
        title="Ask an administrator"
        description="This server cannot send email. An administrator can give you a one-time reset link from Admin › Users."
      >
        {backToSignIn}
      </AuthCard>
    );
  }

  if (sentTo !== undefined) {
    return (
      <AuthCard
        title="Check your email"
        description={`If ${sentTo} has an account here, a reset link is on its way. It works once and expires in an hour.`}
      >
        {backToSignIn}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot password"
      description="Enter the email of your account and we will send you a one-time reset link."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email" error={error}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="solid" full disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="text-sm text-ink-2">
        Remembered it?{' '}
        <Link href="/login" className="text-accent-ink underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
