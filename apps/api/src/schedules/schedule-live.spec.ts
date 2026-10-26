import {
  SCHEDULE_FIRING_UPDATED_LIVE_EVENT,
  SCHEDULE_UPDATED_LIVE_EVENT,
} from '@nautelle/shared';
import type { ScheduleFiring } from '@prisma/client';
import type { LiveService } from '../live/live.service';
import { ScheduleLive } from './schedule-live';

describe('ScheduleLive', () => {
  const publish = jest.fn();
  const live = new ScheduleLive({ publish } as unknown as LiveService);

  beforeEach(() => publish.mockReset());

  it('publishes a schedule change on the project and on admin', () => {
    live.schedule('p1', { id: 's1' });
    expect(publish.mock.calls).toEqual([
      ['project:p1', SCHEDULE_UPDATED_LIVE_EVENT, { id: 's1' }],
      ['admin', SCHEDULE_UPDATED_LIVE_EVENT, { id: 's1' }],
    ]);
  });

  it('publishes a firing and its announcement on both topics', () => {
    const row = {
      id: 7n,
      scheduleId: 's1',
      status: 'fired',
      reason: null,
    } as unknown as ScheduleFiring;
    live.firing('p1', row);
    const on = (topic: string) =>
      publish.mock.calls.filter(([t]) => t === topic).map(([, e]) => e);
    expect(on('project:p1')).toContain(SCHEDULE_FIRING_UPDATED_LIVE_EVENT);
    expect(on('admin')).toEqual(on('project:p1'));
  });

  it('still publishes on admin when the project topic throws', () => {
    publish.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    live.schedule('p1', { id: 's1' });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][0]).toBe('admin');
  });
});
