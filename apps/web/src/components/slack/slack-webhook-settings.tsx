'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Checkbox } from '@andrewbehma/glass-ui/checkbox';
import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { Field, Input } from '@andrewbehma/glass-ui/field';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { toast } from '@andrewbehma/glass-ui/toast';
import {
  SLACK_EVENT_HINTS,
  SLACK_EVENT_LABELS,
  SLACK_EVENTS,
  SLACK_WEBHOOK_URL_MAX,
  type SlackEvent,
  type SlackWebhookStatus,
  type SlackWebhookUpdate,
} from '@nautelle/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { Time } from '../../lib/format/time';
import { ENCRYPTION_KEY_REMEDY } from '../../lib/prerequisites/copy';
import { useErrorToast } from '../../lib/section/use-error-toast';
import { useSection } from '../../lib/section/use-section';
import {
  describeSlackError,
  lastDeliveryFailed,
  lastDeliveryText,
  SLACK_ADMIN_PAGE,
  withEvent,
} from '../../lib/slack/format';
import { AsyncSection } from '../prerequisites/async-section';
import { DisabledReason } from '../prerequisites/disabled-reason';
import { PrerequisiteBanner } from '../prerequisites/prerequisite-banner';

const sameEvents = (a: readonly SlackEvent[], b: readonly SlackEvent[]) =>
  a.length === b.length && a.every((e) => b.includes(e));

/**
 * C-405 (ADR-0109): one Slack incoming webhook — a project's (Settings) or
 * the workspace one (Admin › Integrations). The URL is write-only: the page
 * shows its last characters, never the URL. `path` is its API route;
 * `canEdit` is false for a member who only reads it.
 */
export function SlackWebhookSettings({
  path,
  canEdit,
}: {
  path: string;
  canEdit: boolean;
}) {
  const section = useSection(() => api<SlackWebhookStatus>(path), [path]);
  const showError = useErrorToast();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<SlackEvent[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const loaded = section.data;

  useEffect(() => {
    if (loaded) setEvents(loaded.events);
  }, [loaded]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const body: SlackWebhookUpdate = {
        events,
        ...(url.trim() ? { url: url.trim() } : {}),
      };
      const state = await api<SlackWebhookStatus>(path, {
        method: 'PUT',
        body,
      });
      // The URL is a secret: gone from the page the moment it is sent.
      setUrl('');
      section.setData(state);
      toast.success('Slack webhook saved.');
    } catch (err) {
      setError(errorText(describeSlackError(err)));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await api(path, { method: 'DELETE' });
      setConfirmRemove(false);
      section.refresh();
      toast.success('Slack webhook removed.');
    } catch (err) {
      showError(describeSlackError(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await api(`${path}/test`, { method: 'POST' });
      toast.success('Test message posted. Check the channel.');
    } catch (err) {
      showError(describeSlackError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AsyncSection
      section={section}
      unavailable={{
        title: 'The Slack settings are not answering',
        stillWorks: 'Messages keep going out with the webhook already set.',
      }}
      isEmpty={() => false}
      empty={null}
      skeleton={<Skeleton className="h-64 w-full" />}
    >
      {(state) => {
        const urlMissing = !state.configured && url.trim() === '';
        const dirty = url.trim() !== '' || !sameEvents(events, state.events);
        const delivery = lastDeliveryText(state);
        return (
          <div className="flex flex-col gap-4">
            {state.encryptionAvailable ? null : (
              <PrerequisiteBanner
                tone="warn"
                title="No APP_ENCRYPTION_KEY on the server"
                body={`The webhook URL is stored encrypted, so it cannot be set until the key is. ${ENCRYPTION_KEY_REMEDY}`}
              />
            )}

            <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-ink-3">Webhook</dt>
              <dd>
                {state.configured ? (
                  <span className="font-mono">{state.urlHint}</span>
                ) : state.workspaceFallback ? (
                  <>
                    The workspace webhook posts for this project.{' '}
                    <Link
                      href={SLACK_ADMIN_PAGE}
                      className="text-accent-ink underline underline-offset-2"
                    >
                      Workspace Slack
                    </Link>
                  </>
                ) : (
                  'Not set'
                )}
              </dd>
              {state.configured ? (
                <>
                  <dt className="text-ink-3">Updated</dt>
                  <dd>
                    <Time value={state.updatedAt} />
                  </dd>
                </>
              ) : null}
              {delivery && state.lastDelivery ? (
                <>
                  <dt className="text-ink-3">Delivery</dt>
                  <dd
                    className={
                      lastDeliveryFailed(state) ? 'text-warn' : undefined
                    }
                  >
                    {delivery} · <Time value={state.lastDelivery.at} />
                  </dd>
                </>
              ) : null}
            </dl>

            <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
              <Field
                label={
                  state.configured ? 'Replace the webhook URL' : 'Webhook URL'
                }
                htmlFor={`slack-url-${state.scope}`}
                required={!state.configured}
                hint={
                  state.configured
                    ? 'The stored URL is never shown. Paste a new one to replace it, or leave it empty to keep it.'
                    : 'In Slack: create an app, turn on Incoming Webhooks, add one to a channel and copy its URL. It is stored encrypted.'
                }
                error={error}
              >
                <Input
                  id={`slack-url-${state.scope}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://hooks.slack.com/services/…"
                  maxLength={SLACK_WEBHOOK_URL_MAX}
                  disabled={!canEdit || !state.encryptionAvailable}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-medium text-sm">
                  Post to the channel when
                </legend>
                {SLACK_EVENTS.map((event) => (
                  <Checkbox
                    key={event}
                    id={`slack-event-${state.scope}-${event}`}
                    label={SLACK_EVENT_LABELS[event]}
                    hint={SLACK_EVENT_HINTS[event]}
                    checked={events.includes(event)}
                    disabled={!canEdit || busy}
                    onChange={(e) =>
                      setEvents(withEvent(events, event, e.target.checked))
                    }
                  />
                ))}
              </fieldset>

              {canEdit ? (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      variant="solid"
                      disabled={
                        busy ||
                        !dirty ||
                        urlMissing ||
                        (url.trim() !== '' && !state.encryptionAvailable)
                      }
                      aria-describedby={`slack-save-reason-${state.scope}`}
                    >
                      Save
                    </Button>
                    {state.configured ? (
                      <>
                        <Button
                          variant="glass"
                          disabled={busy}
                          onClick={() => void test()}
                        >
                          Send test message
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => setConfirmRemove(true)}
                        >
                          Remove webhook
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {urlMissing ? (
                    <DisabledReason id={`slack-save-reason-${state.scope}`}>
                      Paste a webhook URL to save it.
                    </DisabledReason>
                  ) : null}
                </div>
              ) : (
                <p className="text-ink-3 text-xs">
                  {state.scope === 'project'
                    ? 'A project admin changes it.'
                    : 'An admin changes it.'}
                </p>
              )}
            </form>

            <ConfirmDialog
              open={confirmRemove}
              onOpenChange={setConfirmRemove}
              title="Remove the Slack webhook?"
              consequence={
                state.scope === 'project'
                  ? 'Nothing more is posted to this channel for the project. The workspace webhook posts for it, if one is set.'
                  : 'Nothing more is posted for projects without their own webhook.'
              }
              verb="Remove webhook"
              busy={busy}
              onConfirm={() => void clear()}
            />
          </div>
        );
      }}
    </AsyncSection>
  );
}
