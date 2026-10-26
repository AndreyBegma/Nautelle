'use client';

import { Card } from '@andrewbehma/glass-ui/card';
import { PageHeader } from '../../../../components/page-header/page-header';
import { SlackWebhookSettings } from '../../../../components/slack/slack-webhook-settings';

/**
 * C-405 (ADR-0109): the workspace-wide Slack incoming webhook. It posts for
 * every project that has no webhook of its own in Settings → Slack.
 */
export default function SlackIntegrationPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title="Slack"
        description="One incoming webhook for the workspace. It posts for every project without its own webhook; a project's own webhook in its Settings replaces it."
      />
      <Card pad="lg">
        <SlackWebhookSettings path="/admin/integrations/slack" canEdit />
      </Card>
    </div>
  );
}
