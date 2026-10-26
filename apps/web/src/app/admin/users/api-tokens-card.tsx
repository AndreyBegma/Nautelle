'use client';

import { Card } from '@andrewbehma/glass-ui/card';
import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { EmptyState } from '@andrewbehma/glass-ui/empty-state';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import type { AdminApiTokenView } from '@nautelle/shared';
import { useState } from 'react';
import { ApiTokenList } from '../../../components/api-tokens/api-token-list';
import { AsyncSection } from '../../../components/prerequisites/async-section';
import { api, describeErrorHint } from '../../../lib/api';
import { useErrorToast } from '../../../lib/section/use-error-toast';
import { useSection } from '../../../lib/section/use-section';

/** C-403: every user's personal API tokens; an admin revokes any of them. */
export function AdminApiTokensCard() {
  const showError = useErrorToast();
  const tokens = useSection(
    () => api<AdminApiTokenView[]>('/admin/api-tokens'),
    [],
  );
  const [revoking, setRevoking] = useState<AdminApiTokenView>();
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api(`/admin/api-tokens/${revoking.id}`, { method: 'DELETE' });
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
        description="Personal API tokens of every user, with their last use. Revoke one that leaked or is no longer needed."
      />
      <AsyncSection
        section={tokens}
        unavailable={{
          title: 'API tokens could not be loaded',
          stillWorks: 'Tokens keep working until revoked or expired.',
        }}
        empty={
          <EmptyState
            title="No API tokens"
            description="Tokens appear here when a user creates one under Account."
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
        title={`Revoke “${revoking?.name ?? ''}” of ${revoking?.userEmail ?? ''}?`}
        consequence="Anything using the token is refused from the next request. The owner sees it as revoked."
        verb="Revoke"
        busy={busy}
        onConfirm={() => void revoke()}
      />
    </Card>
  );
}
