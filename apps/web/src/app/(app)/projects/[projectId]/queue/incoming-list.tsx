'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { Section } from '@andrewbehma/glass-ui/section';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@andrewbehma/glass-ui/segmented-control';
import { toast } from '@andrewbehma/glass-ui/toast';
import type { QueueView } from '@nautelle/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createCard } from '../../../../../lib/board/actions';
import { describeBoardError } from '../../../../../lib/board/format';
import { boardCardHref } from '../../../../../lib/board/href';
import {
  INCOMING_SCOPE_LABEL,
  type IncomingIssue,
  type IncomingScope,
  incomingIssues,
  makeCardRequest,
} from '../../../../../lib/queue/incoming';

/**
 * C-397 (ADR-0098): Queue's incoming work — the project's open GitHub issues,
 * labelled or all, each with **Make a card** (a card linked to the issue, so
 * its pull request closes it) or **Open card** once a card works it.
 */
export function IncomingList({
  projectId,
  data,
  canOperate,
  runnerName,
}: {
  projectId: string;
  data: QueueView;
  canOperate: boolean;
  runnerName?: string | null;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<IncomingScope>('labelled');
  /** The issue whose card is being made; one at a time. */
  const [making, setMaking] = useState<number | null>(null);
  const issues = incomingIssues(data, scope);

  const makeCard = async (issue: IncomingIssue) => {
    setMaking(issue.number);
    try {
      const card = await createCard(projectId, makeCardRequest(issue));
      toast.success(`${card.label} made from #${issue.number}.`);
      router.push(boardCardHref(projectId, card.number));
    } catch (err) {
      toast.error(describeBoardError(err, runnerName));
    } finally {
      setMaking(null);
    }
  };

  return (
    <Section
      title="Incoming"
      description="Open GitHub issues. Make a card to work one on the Board."
      pad="none"
      actions={
        <SegmentedControl size="sm" role="group" aria-label="Issues">
          {(['labelled', 'all'] as const).map((s) => (
            <SegmentedControlItem
              key={s}
              active={scope === s}
              layoutId="incoming-scope"
            >
              <button
                type="button"
                aria-pressed={scope === s}
                className="w-full px-3 text-sm whitespace-nowrap"
                onClick={() => setScope(s)}
              >
                {INCOMING_SCOPE_LABEL[s]}
              </button>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      }
    >
      {issues.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-3">
          {scope === 'labelled'
            ? `No open issue is labelled ${data.readyLabel}.`
            : 'No open issue.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {issues.map((issue) => (
            <li
              key={issue.number}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate">
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-ink-2 hover:underline"
                  >
                    #{issue.number}
                  </a>{' '}
                  {issue.title}
                </span>
                {issue.labels.length > 0 ? (
                  <span className="block truncate text-xs text-ink-3">
                    {issue.labels.join(' · ')}
                  </span>
                ) : null}
              </span>
              {scope === 'all' && issue.ready ? (
                <Badge tone="neutral" size="sm" label="Labelled" />
              ) : null}
              {issue.cardNumber !== null ? (
                <NextLink
                  href={boardCardHref(projectId, issue.cardNumber)}
                  className={buttonClassName({ variant: 'glass', size: 'sm' })}
                >
                  Open card
                </NextLink>
              ) : canOperate ? (
                <Button
                  variant="glass"
                  size="sm"
                  disabled={making !== null}
                  onClick={() => makeCard(issue)}
                >
                  {making === issue.number ? 'Making…' : 'Make a card'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
