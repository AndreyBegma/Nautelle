import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { CryptoModule } from '../common/crypto';
import { ProjectsModule } from '../projects';
import { AdminSlackController, ProjectSlackController } from './slack.controller';
import { SlackClient } from './slack-client';
import { SlackDeliveryService } from './slack-delivery.service';
import { SLACK_OPTIONS, slackOptionsFromEnv } from './slack-options';
import { SlackWebhooksService } from './slack-webhooks.service';

/**
 * Slack notifications through an incoming webhook (C-405, ADR-0109): the
 * project and workspace webhooks of the settings, and the worker that posts
 * what `NotificationWriter` queued in `slack_deliveries` (`enqueueSlack`).
 */
@Module({
  imports: [AuthModule, CryptoModule, ProjectsModule],
  controllers: [ProjectSlackController, AdminSlackController],
  providers: [
    { provide: SLACK_OPTIONS, useFactory: () => slackOptionsFromEnv() },
    SlackClient,
    SlackDeliveryService,
    SlackWebhooksService,
  ],
  exports: [SlackDeliveryService, SlackWebhooksService],
})
export class SlackModule {}
