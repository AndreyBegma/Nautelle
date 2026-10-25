'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button } from '@andrewbehma/glass-ui/button';
import type { AdminApiTokenView, ApiTokenView } from '@nautelle/shared';
import { KeyRound } from 'lucide-react';
import {
  SCOPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from '../../lib/api-tokens/format';
import { Time } from '../../lib/format/time';

const isAdminView = (
  token: ApiTokenView | AdminApiTokenView,
): token is AdminApiTokenView => 'userEmail' in token;

/**
 * C-403: personal API tokens, one row each — name, owner (on the admin list),
 * status, scope, projects, the token's first characters, expiry and last use.
 * Only an active token offers Revoke.
 */
export function ApiTokenList<T extends ApiTokenView>({
  tokens,
  onRevoke,
}: {
  tokens: T[];
  onRevoke: (token: T) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {tokens.map((token) => (
        <li
          key={token.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
        >
          <KeyRound
            size={18}
            className="shrink-0 text-ink-3"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <span className="font-medium">{token.name}</span>
              {isAdminView(token) ? (
                <span className="text-ink-3">{token.userEmail}</span>
              ) : null}
              <Badge
                tone={STATUS_TONE[token.status]}
                label={STATUS_LABEL[token.status]}
              />
              <Badge tone="neutral" label={SCOPE_LABEL[token.scope]} />
            </div>
            <div className="text-xs text-ink-3">
              <span className="font-mono">{token.hint}…</span> ·{' '}
              {token.projects
                ? token.projects
                    .map((project) => project.name ?? 'deleted project')
                    .join(', ')
                : 'All your projects'}{' '}
              · created <Time value={token.createdAt} /> ·{' '}
              {token.revokedAt ? (
                <>
                  revoked <Time value={token.revokedAt} />
                </>
              ) : token.expiresAt ? (
                <>
                  {token.status === 'expired' ? 'expired' : 'expires'}{' '}
                  <Time value={token.expiresAt} />
                </>
              ) : (
                'never expires'
              )}{' '}
              ·{' '}
              {token.lastUsedAt ? (
                <>
                  last used <Time value={token.lastUsedAt} />
                  {token.lastUsedIp ? (
                    <>
                      {' '}
                      from <span className="font-mono">{token.lastUsedIp}</span>
                    </>
                  ) : null}
                </>
              ) : (
                'never used'
              )}
            </div>
          </div>
          {token.status === 'active' ? (
            <Button variant="danger" size="sm" onClick={() => onRevoke(token)}>
              Revoke
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
