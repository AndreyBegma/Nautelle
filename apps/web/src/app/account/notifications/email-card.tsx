'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { Field, Input, Select } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { toast } from '@andrewbehma/glass-ui/toast';
import {
  AI_DIGEST_TIME_PATTERN,
  type NotificationEmailSettings,
  type NotificationEmailView,
} from '@nautelle/shared';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { AsyncSection } from '../../../components/prerequisites/async-section';
import { api, describeErrorHint } from '../../../lib/api';
import { timezoneOptions } from '../../../lib/schedules/format';
import { useErrorToast } from '../../../lib/section/use-error-toast';
import type { Section } from '../../../lib/section/use-section';

/**
 * C-404: where email goes and when the daily digest arrives. Which kinds are
 * emailed, and how, is the Email column of the rules below.
 */
export function EmailCard({
  section,
}: {
  section: Section<NotificationEmailView>;
}) {
  return (
    <Card pad="lg">
      <SectionHeader
        id="email"
        className="mb-4"
        title="Email"
        description="Notifications by email, each one as it happens or gathered into one digest a day of what waits on you and what was done."
      />
      <AsyncSection
        section={section}
        unavailable={{
          title: 'Your email settings could not be loaded',
          stillWorks: 'Emails keep going out with the settings you saved.',
        }}
        isEmpty={() => false}
        empty={null}
        skeleton={<Skeleton className="h-24 w-full" />}
      >
        {(view) =>
          view.configured ? (
            <DigestForm view={view} onSaved={section.setData} />
          ) : (
            <p className="text-ink-2 text-sm">
              Email is not set up on this server. An admin turns it on by
              setting SMTP_URL in the API&rsquo;s environment.
            </p>
          )
        }
      </AsyncSection>
    </Card>
  );
}

function DigestForm({
  view,
  onSaved,
}: {
  view: NotificationEmailView;
  onSaved: (view: NotificationEmailView) => void;
}) {
  const [form, setForm] = useState<NotificationEmailSettings>(view);
  const [busy, setBusy] = useState(false);
  const showError = useErrorToast();
  const zones = useMemo(() => timezoneOptions(), []);

  useEffect(() => {
    setForm({ digestTime: view.digestTime, timezone: view.timezone });
  }, [view.digestTime, view.timezone]);

  const timeOk = AI_DIGEST_TIME_PATTERN.test(form.digestTime);
  const dirty =
    form.digestTime !== view.digestTime || form.timezone !== view.timezone;
  const zoneOptions = zones.includes(form.timezone)
    ? zones
    : [form.timezone, ...zones];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!timeOk) return;
    setBusy(true);
    try {
      const saved = await api<NotificationEmailView>('/notifications/email', {
        method: 'PUT',
        body: form,
      });
      onSaved(saved);
      toast.success(
        `Your digest arrives daily at ${saved.digestTime}, ${saved.timezone}.`,
      );
    } catch (err) {
      showError(describeErrorHint(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <p className="text-sm">
        Emails go to <span className="font-medium">{view.address}</span>, the
        address you sign in with.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Digest time"
          htmlFor="email-digest-time"
          hint="Sent only on a day something is in it."
        >
          <Input
            id="email-digest-time"
            type="time"
            value={form.digestTime}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, digestTime: e.target.value }))
            }
          />
        </Field>
        <Field label="Timezone" htmlFor="email-digest-timezone">
          <Select
            id="email-digest-timezone"
            value={form.timezone}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, timezone: e.target.value }))
            }
          >
            {zoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {timeOk ? null : (
        <p role="alert" className="text-danger text-xs">
          The time is HH:MM, 24-hour.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          variant="solid"
          type="submit"
          disabled={busy || !dirty || !timeOk}
        >
          Save
        </Button>
      </div>
    </form>
  );
}
