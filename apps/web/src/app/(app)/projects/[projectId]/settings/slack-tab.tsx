'use client';

import { Section } from '@andrewbehma/glass-ui/section';
import { SlackWebhookSettings } from '../../../../../components/slack/slack-webhook-settings';

/**
 * C-405 (ADR-0109): Settings → Slack — the project's own incoming webhook,
 * which replaces the workspace one for this project. A project admin
 * changes it; every member reads it.
 */
export function SlackTab({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  return (
    <Section
      title="Slack"
      description="Post this project's finished cards, demos, questions, failures, budgets and merges to a Slack channel."
    >
      <SlackWebhookSettings
        path={`/projects/${projectId}/slack`}
        canEdit={isAdmin}
      />
    </Section>
  );
}
