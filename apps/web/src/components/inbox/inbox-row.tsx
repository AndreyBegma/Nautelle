'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import type { InboxItemView } from '@nautelle/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatAge } from '../../lib/fleet/format';
import {
  INBOX_ITEM_TAG,
  inboxItemHref,
  inboxItemLabel,
  inboxItemTitle,
} from '../../lib/inbox/format';

/** A row's kind tag: the kinds that block work warn, the rest are neutral. */
const TAG_TONE: Record<InboxItemView['kind'], 'warn' | 'danger' | 'neutral'> = {
  design: 'neutral',
  question: 'warn',
  merge: 'neutral',
  failed: 'danger',
  permission: 'warn',
  setup: 'danger',
};

/**
 * One Inbox item (C-390): its label, title (opening it in full), kind tag and
 * age, a line on why it waits, what the decision needs in view, and the
 * buttons that make it.
 */
export function InboxRow({
  item,
  now,
  detail,
  actions,
  children,
}: {
  item: InboxItemView;
  now: number;
  detail?: ReactNode;
  actions?: ReactNode;
  /** What the decision needs in view: the question, the demo, the preview. */
  children?: ReactNode;
}) {
  return (
    <li
      className="flex min-w-0 flex-col gap-2 py-3"
      data-testid="inbox-item"
      data-kind={item.kind}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-ink-3">
          {inboxItemLabel(item)}
        </span>
        <Link
          href={inboxItemHref(item)}
          className="min-w-0 break-words font-medium hover:underline"
        >
          {inboxItemTitle(item)}
        </Link>
        <Badge tone={TAG_TONE[item.kind]} label={INBOX_ITEM_TAG[item.kind]} />
        <span className="ml-auto text-xs text-ink-3 num">
          {formatAge(item.since, now)}
        </span>
      </div>
      {detail ? <div className="text-sm text-ink-2">{detail}</div> : null}
      {children}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}
