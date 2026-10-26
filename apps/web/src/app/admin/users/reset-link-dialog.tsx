'use client';

import { Banner } from '@andrewbehma/glass-ui/banner';
import { Button } from '@andrewbehma/glass-ui/button';
import { CodeBlock } from '@andrewbehma/glass-ui/code-block';
import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import { toast } from '@andrewbehma/glass-ui/toast';
import type { PasswordResetLinkResponse } from '@nautelle/shared';
import { Time } from '../../../lib/format/time';

/** A reset link an admin just created, for the account it resets. */
export interface IssuedResetLink {
  email: string;
  link: PasswordResetLinkResponse;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Reset link copied.');
  } catch {
    toast.error('Could not copy — select the text and copy it by hand.');
  }
}

/**
 * C-402 (ADR-0113): shows a one-time reset link once. Only its hash is
 * stored, so closing the dialog drops it; a new link replaces this one.
 */
export function ResetLinkDialog({
  issued,
  onClose,
}: {
  issued: IssuedResetLink | null;
  onClose: () => void;
}) {
  const url = issued ? `${window.location.origin}${issued.link.path}` : '';
  return (
    <DialogRoot
      open={issued !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {issued ? (
        <DialogContent
          title={
            issued.link.kind === 'two_factor'
              ? '2FA reset link'
              : 'Password reset link'
          }
          description={`Send this link to ${issued.email} in a way you trust. It works once.`}
          footer={
            <>
              <Button variant="glass" onClick={() => copy(url)}>
                Copy link
              </Button>
              <Button variant="solid" onClick={onClose}>
                Done
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Banner tone="warn">
              This is the only time you will see it. Anyone with the link can
              set a new password for this account.
            </Banner>
            <CodeBlock code={url} wrap />
            <p className="text-sm text-ink-2">
              Expires <Time value={issued.link.expiresAt} />.{' '}
              {issued.link.kind === 'two_factor'
                ? 'Using it sets a new password, turns off two-factor sign-in so they set it up again, and signs them out everywhere else.'
                : 'Using it sets a new password and signs them out everywhere else.'}
            </p>
          </div>
        </DialogContent>
      ) : null}
    </DialogRoot>
  );
}
