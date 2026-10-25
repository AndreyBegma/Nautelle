'use client';

import { Banner } from '@andrewbehma/glass-ui/banner';
import { Button } from '@andrewbehma/glass-ui/button';
import { Card } from '@andrewbehma/glass-ui/card';
import { Checkbox } from '@andrewbehma/glass-ui/checkbox';
import { CodeBlock } from '@andrewbehma/glass-ui/code-block';
import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { Field, Input, Select } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import {
  API_TOKEN_EXPIRY_DAYS,
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
  type ApiTokenView,
  type CreateApiTokenRequest,
  type CreatedApiToken,
  type ProjectSummary,
} from '@nautelle/shared';
import { type FormEvent, useState } from 'react';
import { ApiTokenList } from '../../components/api-tokens/api-token-list';
import { AsyncSection } from '../../components/prerequisites/async-section';
import { api, describeError, describeErrorHint } from '../../lib/api';
import {
  curlExample,
  type ExpiryChoice,
  expiresAtFor,
  expiryLabel,
  SCOPE_LABEL,
} from '../../lib/api-tokens/format';
import { useErrorToast } from '../../lib/section/use-error-toast';
import { useSection } from '../../lib/section/use-section';

const EXPIRY_CHOICES: ExpiryChoice[] = API_TOKEN_EXPIRY_DAYS.map((days) =>
  days === null ? 'never' : (`${days}` as ExpiryChoice),
);

const SCOPE_HINT: Record<ApiTokenScope, string> = {
  owner:
    'Acts with your current role — never more. If your role drops, so does the token.',
  read_only: 'Reads only: every write is refused.',
};

/** The new token, shown once: the API stores only its hash. */
function NewToken({
  created,
  onDone,
}: {
  created: CreatedApiToken;
  onDone: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <Banner tone="warn" title={`Copy “${created.name}” now`}>
        This is the only time the token is shown. Nautelle keeps only its hash.
      </Banner>
      <CodeBlock code={created.token} />
      <CodeBlock
        code={curlExample(`${window.location.origin}/api`, created.token)}
        language="bash"
        wrap
      />
      <div>
        <Button variant="glass" size="sm" onClick={onDone}>
          I have copied it
        </Button>
      </div>
    </div>
  );
}

function CreateTokenForm({
  onCreated,
}: {
  onCreated: (t: CreatedApiToken) => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('owner');
  const [expiry, setExpiry] = useState<ExpiryChoice>('90');
  const [limited, setLimited] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const projects = useSection(
    () => (limited ? api<ProjectSummary[]>('/projects') : Promise.resolve([])),
    [limited],
  );

  const toggleProject = (id: string, on: boolean) =>
    setProjectIds((ids) =>
      on ? [...ids, id] : ids.filter((other) => other !== id),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (limited && projectIds.length === 0) {
      setError('Pick at least one project, or allow every project.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const body: CreateApiTokenRequest = {
        name,
        scope,
        expiresAt: expiresAtFor(expiry),
        ...(limited ? { projectIds } : {}),
      };
      const created = await api<CreatedApiToken>('/auth/api-tokens', {
        method: 'POST',
        body,
      });
      setName('');
      setProjectIds([]);
      setLimited(false);
      onCreated(created);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 flex max-w-md flex-col gap-4">
      <Field
        label="Name"
        htmlFor="api-token-name"
        hint="What uses it, e.g. CI deploy."
      >
        <Input
          id="api-token-name"
          required
          maxLength={API_TOKEN_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Access" htmlFor="api-token-scope" hint={SCOPE_HINT[scope]}>
        <Select
          id="api-token-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as ApiTokenScope)}
        >
          {API_TOKEN_SCOPES.map((value) => (
            <option key={value} value={value}>
              {SCOPE_LABEL[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Expires" htmlFor="api-token-expiry">
        <Select
          id="api-token-expiry"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {expiryLabel(choice)}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        label="Limit to some projects"
        hint="Otherwise the token reaches every project you can."
        checked={limited}
        onChange={(e) => setLimited(e.target.checked)}
      />
      {limited ? (
        <AsyncSection
          section={projects}
          unavailable={{
            title: 'Your projects could not be loaded',
            stillWorks: 'You can still make a token for every project.',
          }}
          isEmpty={(list) => list.length === 0}
          empty={
            <p className="text-sm text-ink-3">You are in no project yet.</p>
          }
          skeleton={<Skeleton className="h-16 w-full" />}
        >
          {(list) => (
            <fieldset className="flex flex-col gap-2 pl-6">
              <legend className="sr-only">Projects</legend>
              {list.map((project) => (
                <Checkbox
                  key={project.id}
                  label={project.displayName}
                  checked={projectIds.includes(project.id)}
                  onChange={(e) => toggleProject(project.id, e.target.checked)}
                />
              ))}
            </fieldset>
          )}
        </AsyncSection>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div>
        <Button type="submit" variant="solid" disabled={busy}>
          Create token
        </Button>
      </div>
    </form>
  );
}

/**
 * C-403: Account › API tokens. A token calls the REST API as you
 * (`Authorization: Bearer …`), never with more than your current role.
 */
export function ApiTokensCard() {
  const showError = useErrorToast();
  const tokens = useSection(() => api<ApiTokenView[]>('/auth/api-tokens'), []);
  const [created, setCreated] = useState<CreatedApiToken>();
  const [revoking, setRevoking] = useState<ApiTokenView>();
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api(`/auth/api-tokens/${revoking.id}`, { method: 'DELETE' });
      setRevoking(undefined);
      tokens.retry();
    } catch (err) {
      showError(describeErrorHint(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card pad="lg">
      <SectionHeader
        className="mb-4"
        title="API tokens"
        description="Call the Nautelle API from scripts and CI with Authorization: Bearer. A token acts as you, with your current role or less; every use is in the audit log under its name."
      />
      {created ? (
        <NewToken created={created} onDone={() => setCreated(undefined)} />
      ) : (
        <CreateTokenForm
          onCreated={(token) => {
            setCreated(token);
            tokens.retry();
          }}
        />
      )}
      <AsyncSection
        section={tokens}
        unavailable={{
          title: 'Your API tokens could not be loaded',
          stillWorks: 'Tokens you made keep working.',
        }}
        empty={
          <EmptyState
            title="No API tokens"
            description="Tokens you create appear here with their last use."
          />
        }
        isEmpty={(list) => list.length === 0}
        skeleton={<Skeleton className="h-24 w-full" />}
      >
        {(list) => <ApiTokenList tokens={list} onRevoke={setRevoking} />}
      </AsyncSection>
      <ConfirmDialog
        open={revoking !== undefined}
        onOpenChange={(open) => !open && setRevoking(undefined)}
        title={`Revoke “${revoking?.name ?? ''}”?`}
        consequence="Anything using the token is refused from the next request. This cannot be undone."
        verb="Revoke"
        busy={busy}
        onConfirm={() => void revoke()}
      />
    </Card>
  );
}
