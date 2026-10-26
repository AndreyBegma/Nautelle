'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { Field, Input } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { toast } from '@andrewbehma/glass-ui/toast';
import { useEffect, useState } from 'react';
import { AsyncSection } from '../../components/prerequisites/async-section';
import { describeError } from '../../lib/api';
import {
  ACCOUNT_TIMEOUT_TEXT,
  parseTimeoutMinutes,
  timeoutError,
} from '../../lib/projects/away-mode';
import {
  saveUserSettings,
  useUserSettings,
} from '../../lib/settings/user-settings';

/**
 * C-401: how long a tool call of this person's sessions waits for an answer
 * in away mode, where the project sets no timeout of its own.
 */
export function AwayTimeoutCard() {
  const settings = useUserSettings();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const stored = settings.data?.toolUseTimeoutMinutes;

  useEffect(() => {
    if (stored !== undefined) setText(stored === null ? '' : String(stored));
  }, [stored]);

  const parsed = parseTimeoutMinutes(text);

  const save = async () => {
    if (parsed === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await saveUserSettings({ toolUseTimeoutMinutes: parsed });
      settings.setData(next);
      toast.success(
        parsed === null
          ? 'Request timeout reset to the default.'
          : 'Request timeout saved.',
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card pad="lg">
      <SectionHeader
        className="mb-4"
        title="Away mode timeout"
        description="How long a tool call of your sessions waits for an answer in away mode. The session waits the whole time; only after it does Claude Code show its own dialog."
      />
      <AsyncSection
        section={settings}
        unavailable={{
          title: 'Your settings could not be loaded',
          stillWorks:
            'Away mode still works, with the project or default timeout.',
        }}
        empty={null}
        isEmpty={() => false}
        skeleton={<Skeleton className="h-16 w-full max-w-sm" />}
      >
        {() => (
          <form
            className="flex max-w-sm flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label="Timeout (minutes)"
              htmlFor="account-tool-use-timeout"
              hint={ACCOUNT_TIMEOUT_TEXT}
              error={error ?? timeoutError(text)}
            >
              <Input
                id="account-tool-use-timeout"
                inputMode="numeric"
                placeholder="Not set"
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="solid"
                disabled={
                  busy || parsed === undefined || parsed === (stored ?? null)
                }
              >
                Save
              </Button>
            </div>
          </form>
        )}
      </AsyncSection>
    </Card>
  );
}
