'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Button } from '@andrewbehma/glass-ui/button';
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '@andrewbehma/glass-ui/popover';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { INBOX_HREF, inboxLinkText } from '../../lib/inbox/format';
import {
  BELL_LIMIT,
  bellLabel,
  unreadCountText,
} from '../../lib/notifications/format';
import { useNotifications } from '../../lib/notifications/use-notifications';
import { useInbox } from '../inbox/inbox-context';
import { NotificationItem } from './notification-item';
import { useCurrentUser } from './user-context';

/**
 * The top bar's bell. It also holds the `user:<id>` subscription that keeps
 * the shell's live socket (and its status dot) alive.
 */
export function NotificationBell() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const feed = useNotifications(user.id, { limit: BELL_LIMIT, capped: true });
  const inbox = useInbox();

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="md"
          icon
          className="relative"
          aria-label={bellLabel(feed.unreadCount)}
        >
          <Bell size={16} aria-hidden="true" />
          {feed.unreadCount > 0 ? (
            // A dot, not a number: a count would cover the bell (#654). The
            // number is in the name and on the popover's heading row.
            <Badge
              dot
              tone="danger"
              aria-hidden="true"
              className="absolute top-1 right-1 size-2 ring-2 ring-surface"
              data-testid="bell-count"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        title="Notifications"
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))]"
        headerAction={
          <span className="flex items-center gap-2">
            {feed.unreadCount > 0 ? (
              <Badge
                tone="danger"
                count={feed.unreadCount}
                aria-label={`${unreadCountText(feed.unreadCount)} unread`}
              />
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={feed.unreadCount === 0}
              onClick={() => void feed.markAllRead()}
            >
              Mark all read
            </Button>
          </span>
        }
        footer={
          <span className="flex items-center justify-between gap-3">
            <Link
              href="/account/notifications"
              onClick={() => setOpen(false)}
              className="text-sm hover:underline"
            >
              See all
            </Link>
            {/* C-390: the bell tells; the Inbox is where it gets handled. */}
            {user.role === 'viewer' ? null : (
              <Link
                href={INBOX_HREF}
                onClick={() => setOpen(false)}
                className="text-sm hover:underline"
              >
                {inboxLinkText(inbox.data?.total ?? 0)}
              </Link>
            )}
          </span>
        }
      >
        {feed.failed ? (
          <p className="text-ink-2 px-4 py-6 text-center text-sm">
            Could not load notifications.{' '}
            <button
              type="button"
              className="text-accent-ink underline"
              onClick={() => void feed.reload()}
            >
              Try again
            </button>
          </p>
        ) : feed.items.length === 0 ? (
          <p className="text-ink-2 px-4 py-6 text-center text-sm">
            {feed.loading ? 'Loading…' : 'Nothing needs you right now.'}
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {feed.items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                onRead={(id) => void feed.markRead(id)}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
