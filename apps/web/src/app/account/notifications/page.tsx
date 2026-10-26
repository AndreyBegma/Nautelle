'use client';

import type { NotificationEmailView } from '@nautelle/shared';
import { PageHeader } from '../../../components/page-header/page-header';
import { api } from '../../../lib/api';
import { useTelegramLink } from '../../../lib/notifications/use-telegram-link';
import { useSection } from '../../../lib/section/use-section';
import { EmailCard } from './email-card';
import { FeedSection } from './feed-section';
import { MutesSection } from './mutes-section';
import { RulesSection } from './rules-section';
import { TelegramCard } from './telegram-card';

export default function NotificationsPage() {
  const link = useTelegramLink();
  const linked = link.view.status === 'ready' && link.view.state.linked;
  const email = useSection(
    () => api<NotificationEmailView>('/notifications/email'),
    [],
  );
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Things that need a person, where to get them, and which projects to silence."
      />
      <div className="flex flex-col gap-6">
        <FeedSection />
        <TelegramCard link={link} />
        <EmailCard section={email} />
        <RulesSection
          telegramLinked={linked}
          emailConfigured={email.data?.configured ?? false}
        />
        <MutesSection />
      </div>
    </div>
  );
}
