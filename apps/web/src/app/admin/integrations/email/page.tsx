'use client';

import { Banner } from '@andrewbehma/glass-ui/banner';
import { Button } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { toast } from '@andrewbehma/glass-ui/toast';
import type { EmailIntegrationStatus } from '@nautelle/shared';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '../../../../components/page-header/page-header';
import { AsyncSection } from '../../../../components/prerequisites/async-section';
import { PrerequisiteBanner } from '../../../../components/prerequisites/prerequisite-banner';
import { api, describeErrorHint } from '../../../../lib/api';
import { Time } from '../../../../lib/format/time';
import { useErrorToast } from '../../../../lib/section/use-error-toast';
import { useSection } from '../../../../lib/section/use-section';

const PATH = '/admin/integrations/email';
const SETTINGS_PAGE = '/account/notifications';

/**
 * C-404: the SMTP server, read-only — it comes from `SMTP_URL` in the
 * server's environment and its credentials never reach the browser.
 */
export default function EmailIntegrationPage() {
  const section = useSection(() => api<EmailIntegrationStatus>(PATH), []);
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    try {
      await api(`${PATH}/test`, { method: 'POST' });
      toast.success('Test email sent to your address.');
      section.refresh();
    } catch (err) {
      showError(describeErrorHint(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title="Email"
        description="One SMTP server for this instance, set in its environment. Each person picks which notifications they get by email, at once or in a daily digest, under Account › Notifications."
      />

      <AsyncSection
        section={section}
        unavailable={{
          title: 'The email settings are not answering',
          stillWorks: 'Emails keep going out with the server already set.',
        }}
        isEmpty={() => false}
        empty={null}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {(state) => (
          <>
            {state.configured ? null : (
              <PrerequisiteBanner
                tone="info"
                title="No SMTP_URL on the server"
                body="Email is off. Set SMTP_URL (and optionally SMTP_FROM) in the API's environment, for example smtps://user:password@smtp.example.com, then restart the API."
              />
            )}
            {state.configured && !state.links ? (
              <PrerequisiteBanner
                tone="warn"
                title="No APP_URL on the server"
                body="Emails go out without links to the app. Set APP_URL to the web app's address so each email links to what it is about."
              />
            ) : null}

            <Card pad="lg">
              <SectionHeader className="mb-4" title="Status" />
              <dl className="grid max-w-xl grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-ink-3">Server</dt>
                <dd className="break-all">
                  {state.server ?? 'Not configured'}
                  {state.server ? (
                    <div className="text-xs text-ink-3">
                      {state.secure
                        ? 'TLS from the start (smtps)'
                        : 'STARTTLS when the server offers it'}
                    </div>
                  ) : null}
                </dd>
                <dt className="text-ink-3">Sender</dt>
                <dd className="break-all">{state.from}</dd>
                <dt className="text-ink-3">Waiting</dt>
                <dd>{state.pending}</dd>
                <dt className="text-ink-3">Last sent</dt>
                <dd>
                  <Time value={state.lastSentAt} />
                </dd>
              </dl>
              {state.lastError ? (
                <div className="mt-4">
                  <Banner tone="warn" title="Last refused email">
                    {state.lastError}
                  </Banner>
                </div>
              ) : null}
              {state.configured ? (
                <div className="mt-4 flex flex-col gap-1">
                  <div>
                    <Button
                      variant="glass"
                      disabled={busy}
                      onClick={() => void test()}
                    >
                      Send test email
                    </Button>
                  </div>
                  <p className="text-xs text-ink-2">
                    The test goes to your own address. Which notifications reach
                    you by email is set in{' '}
                    <Link
                      href={SETTINGS_PAGE}
                      className="text-accent-ink underline underline-offset-2"
                    >
                      Account › Notifications
                    </Link>
                    .
                  </p>
                </div>
              ) : null}
            </Card>
          </>
        )}
      </AsyncSection>
    </div>
  );
}
