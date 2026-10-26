import {
  BLOCKED_CHECKPOINT_DELAY_MS,
  RUNNER_OFFLINE_AFTER_MS,
} from '@nautelle/shared';

/** Timings of the notification loops; e2e tests override the provider. */
export interface NotificationOptions {
  /** Start the matcher and watcher timers at bootstrap. Tests drive `tick()` themselves. */
  autoStart: boolean;
  /** D4: how often the matcher reads new events. */
  matcherIntervalMs: number;
  /** Events read per matcher transaction. */
  matcherBatch: number;
  /**
   * How long a hole in `events.id` is waited for before it is taken as a
   * rolled-back insert (spec 22 notes). Ids come from a sequence and two
   * concurrent inserts can commit out of order.
   */
  holeWaitMs: number;
  /** D5: how often the runner watcher looks. */
  watcherIntervalMs: number;
  /** D5: a runner away this long opens an incident. */
  offlineAfterMs: number;
  /** Note 23: how often the blocked-checkpoint sweep looks. */
  blockedSweepIntervalMs: number;
  /** Note 23: a blocked checkpoint standing this long notifies. */
  blockedDelayMs: number;
  /** C-482: notifications and Slack deliveries older than this are deleted nightly. */
  retentionDays: number;
  /** C-482: rows the retention job deletes per statement. */
  retentionBatch: number;
}

export const NOTIFICATION_OPTIONS = Symbol('NOTIFICATION_OPTIONS');

export const NOTIFICATION_RETENTION_DAYS_DEFAULT = 90;
export const NOTIFICATION_RETENTION_DAYS_MIN = 7;

/**
 * `NOTIFICATION_RETENTION_DAYS`: unset or blank is the default; anything but an
 * integer of at least the minimum throws, so the API refuses to boot rather
 * than silently keeping or dropping more than the operator asked for.
 */
export const notificationRetentionDays = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') {
    return NOTIFICATION_RETENTION_DAYS_DEFAULT;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < NOTIFICATION_RETENTION_DAYS_MIN) {
    throw new Error(
      `NOTIFICATION_RETENTION_DAYS must be an integer of at least ${NOTIFICATION_RETENTION_DAYS_MIN}, got "${raw}"`,
    );
  }
  return value;
};

export const defaultNotificationOptions: NotificationOptions = {
  autoStart: true,
  matcherIntervalMs: 2_000,
  matcherBatch: 500,
  holeWaitMs: 10_000,
  watcherIntervalMs: 60_000,
  offlineAfterMs: RUNNER_OFFLINE_AFTER_MS,
  blockedSweepIntervalMs: 60_000,
  blockedDelayMs: BLOCKED_CHECKPOINT_DELAY_MS,
  retentionDays: NOTIFICATION_RETENTION_DAYS_DEFAULT,
  retentionBatch: 5_000,
};
