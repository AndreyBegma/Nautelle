import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { CryptoModule } from '../common/crypto';
import { LiveModule } from '../live/live.module';
import { MailModule } from '../mail/mail.module';
import { ProjectsModule } from '../projects';
import { RunnersModule } from '../runners/runners.module';
import { SettingsModule } from '../settings/settings.module';
import { AccountThrottleNotifier } from './account-throttle-notifier';
import { BlockedCheckpointSweep } from './blocked-checkpoint-sweep';
import { BotTokenStore } from './bot-token.store';
import { EmailDeliveryService } from './email-delivery.service';
import {
  EmailAdminController,
  NotificationEmailController,
} from './notification-email.controller';
import { NotificationEmailService } from './notification-email.service';
import { NotificationMatcher } from './notification-matcher';
import {
  defaultNotificationOptions,
  NOTIFICATION_OPTIONS,
} from './notification-options';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationWriter } from './notification-writer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RunnerReplacedNotifier } from './runner-replaced-notifier';
import { RunnerWatcher } from './runner-watcher';
import { TelegramDeliveryLedger } from './telegram-delivery-ledger';

/**
 * Notifications (docs/specs/22): the event matcher, the runner watcher, the
 * replaced-connection alert (C-108), the
 * blocked-checkpoint sweep, the
 * in-app centre with its rules and mutes, the bookkeeping the Telegram
 * module sends from, and email delivery with its daily digest (C-404). Exports what `apps/api/src/telegram/**` builds on, and
 * the writer budgets notify through (spec 28 D6).
 */
@Module({
  imports: [
    AuthModule,
    CryptoModule,
    LiveModule,
    MailModule,
    ProjectsModule,
    RunnersModule,
    SettingsModule,
  ],
  controllers: [
    NotificationsController,
    NotificationEmailController,
    EmailAdminController,
  ],
  providers: [
    {
      provide: NOTIFICATION_OPTIONS,
      // The e2e suite drives `tick()` itself; timers would race its fixtures.
      useFactory: () => ({
        ...defaultNotificationOptions,
        autoStart: process.env.APP_ENV !== 'test',
      }),
    },
    NotificationWriter,
    NotificationsService,
    NotificationRulesService,
    NotificationMatcher,
    RunnerWatcher,
    RunnerReplacedNotifier,
    BlockedCheckpointSweep,
    AccountThrottleNotifier,
    TelegramDeliveryLedger,
    BotTokenStore,
    EmailDeliveryService,
    NotificationEmailService,
  ],
  exports: [
    CryptoModule,
    MailModule,
    BotTokenStore,
    TelegramDeliveryLedger,
    NotificationsService,
    NotificationRulesService,
    NotificationWriter,
  ],
})
export class NotificationsModule {}
