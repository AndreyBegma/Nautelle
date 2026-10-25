'use client';

import { buttonClassName } from '@andrewbehma/glass-ui/button';
import { Section } from '@andrewbehma/glass-ui/section';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import type { InboxItemView } from '@nautelle/shared';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { Time } from '../../lib/format/time';
import {
  INBOX_HREF,
  INBOX_ITEM_TAG,
  inboxItemHref,
  inboxItemLabel,
  inboxItemTitle,
  inboxPreview,
} from '../../lib/inbox/format';
import { useInbox } from '../inbox/inbox-context';
import { Retry } from './shared';

const ROW_LINK = 'flex items-start gap-3 rounded-md px-2 py-2 hover:bg-hover';

function PreviewRow({ item }: { item: InboxItemView }) {
  return (
    <Link href={inboxItemHref(item)} className={ROW_LINK}>
      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-ink-3">
        {inboxItemLabel(item)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {inboxItemTitle(item)}
        </span>
        <span className="truncate text-xs text-ink-3">
          {item.projectName} · {INBOX_ITEM_TAG[item.kind]}
        </span>
      </span>
      <Time
        value={item.since}
        className="shrink-0 text-xs whitespace-nowrap text-ink-3"
      />
    </Link>
  );
}

/**
 * Overview's glance at the Inbox (C-390): the oldest few items it holds, each
 * opening where it is decided, and the way to the Inbox for the rest.
 */
export function NeedsYou() {
  const inbox = useInbox();
  const view = inbox.data;
  const preview = view ? inboxPreview(view) : undefined;

  return (
    <Section
      title="Needs you"
      description="The oldest items in your Inbox, across every project."
      pad="none"
      bodyClassName="px-2 py-1"
      actions={
        <Link
          href={INBOX_HREF}
          className={buttonClassName({ variant: 'ghost', size: 'sm' })}
        >
          Open Inbox
        </Link>
      }
    >
      {preview ? (
        preview.items.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-2 text-sm text-ink-2">
            <CircleCheck aria-hidden="true" className="size-4 text-ok" />
            Nothing is waiting on you.
          </p>
        ) : (
          <>
            <ul className="flex flex-col" data-testid="inbox-preview">
              {preview.items.map((item) => (
                <li key={item.id}>
                  <PreviewRow item={item} />
                </li>
              ))}
            </ul>
            {preview.more > 0 ? (
              <p className="px-2 pb-2">
                <Link
                  href={INBOX_HREF}
                  className="text-sm text-ink-2 hover:underline"
                >
                  {preview.more} more in the Inbox
                </Link>
              </p>
            ) : null}
          </>
        )
      ) : inbox.error !== null ? (
        <Retry title="Could not check what waits on you" section={inbox} />
      ) : (
        <Skeleton className="m-2 h-24" />
      )}
    </Section>
  );
}
