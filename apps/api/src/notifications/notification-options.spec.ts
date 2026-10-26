import { notificationRetentionDays } from './notification-options';

describe('notificationRetentionDays', () => {
  it('defaults to 90 days when unset or blank', () => {
    expect(notificationRetentionDays(undefined)).toBe(90);
    expect(notificationRetentionDays('')).toBe(90);
    expect(notificationRetentionDays('  ')).toBe(90);
  });

  it('accepts an integer from 7 up', () => {
    expect(notificationRetentionDays('7')).toBe(7);
    expect(notificationRetentionDays('365')).toBe(365);
  });

  it('refuses a value below 7 or not an integer, with a message', () => {
    for (const raw of ['3', '0', '-5', '6.5', 'abc']) {
      expect(() => notificationRetentionDays(raw)).toThrow(
        /NOTIFICATION_RETENTION_DAYS must be an integer of at least 7/,
      );
    }
  });
});
