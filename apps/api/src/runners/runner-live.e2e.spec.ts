import {
  LIVE_SOCKET_PATH,
  RUNNER_UPDATED_EVENT,
  type RunnerUpdatedEvent,
} from '@nautelle/shared';
import { allowedLiveOrigin } from '../live/live-options';
import { TestLiveSocket } from '../live/testing/live-e2e';
import { nextIp, resetDatabase, type Session } from '../test/e2e-app';
import {
  adminSession,
  createRunner,
  createRunnerE2eApp,
  pairBody,
  type RunnerE2eContext,
  repairRunner,
  TestRunnerSocket,
} from './testing/runner-e2e';

/** Long enough for a duplicate publish to show up behind the first. */
const QUIET_MS = 400;

/**
 * Every `runner.updated` the socket receives until it has been quiet for
 * `QUIET_MS`; other events on `admin` (activity items) are skipped.
 */
const runnerEvents = async (
  socket: TestLiveSocket,
): Promise<RunnerUpdatedEvent[]> => {
  const seen: RunnerUpdatedEvent[] = [];
  for (;;) {
    try {
      const message = await socket.next('event', QUIET_MS);
      if (message.event === RUNNER_UPDATED_EVENT) {
        seen.push(message.data as RunnerUpdatedEvent);
      }
    } catch {
      return seen;
    }
  }
};

describe('runner.updated on the admin topic (e2e, C-479)', () => {
  let ctx: RunnerE2eContext;
  let admin: Session;
  let live: TestLiveSocket;
  const runners: TestRunnerSocket[] = [];

  beforeAll(async () => {
    ctx = await createRunnerE2eApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await adminSession(ctx);
    live = new TestLiveSocket(
      `${ctx.origin.replace(/^http/, 'ws')}${LIVE_SOCKET_PATH}`,
      { token: admin.token, origin: allowedLiveOrigin() },
    );
    await live.ready();
    expect(await live.subscribe('admin')).toMatchObject({ type: 'subscribed' });
  });
  afterEach(() => {
    live.socket.terminate();
    for (const socket of runners.splice(0)) socket.socket.terminate();
  });

  const connect = async (token: string) => {
    const socket = new TestRunnerSocket(ctx.origin, token);
    runners.push(socket);
    await socket.connect();
    return socket;
  };

  const pair = async (code: string) => {
    const response = await ctx
      .http()
      .post('/runners/pair')
      .set('X-Forwarded-For', nextIp())
      .send(pairBody(code));
    expect(response.status).toBe(200);
    return response.body as { runnerId: string; token: string };
  };

  it('publishes each change once: create, pair, connect, rename, disconnect, revoke', async () => {
    const { runner, pairingCode } = await createRunner(admin);
    const runnerId = runner.id;
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'offline' }]);

    const { token } = await pair(pairingCode);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'offline' }]);

    const first = await connect(token);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'online' }]);

    const renamed = await admin.send('patch', `/admin/runners/${runnerId}`, {
      name: 'workstation',
    });
    expect(renamed.status).toBe(200);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'online' }]);

    await first.close();
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'offline' }]);

    await connect(token);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'online' }]);

    const revoked = await admin.send(
      'post',
      `/admin/runners/${runnerId}/revoke`,
    );
    expect(revoked.status).toBe(200);
    // The socket revoke closes adds no `offline` of its own.
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'revoked' }]);

    // Revoking again changes nothing.
    await admin.send('post', `/admin/runners/${runnerId}/revoke`);
    expect(await runnerEvents(live)).toEqual([]);
  });

  it('a takeover publishes one online, a re-pair of a live runner one offline', async () => {
    const { runner, pairingCode } = await createRunner(admin);
    const runnerId = runner.id;
    const { token } = await pair(pairingCode);
    await connect(token);
    await runnerEvents(live);

    // The older socket closes 4409; it is no longer the runner's, so no offline.
    await connect(token);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'online' }]);

    await repairRunner(ctx, admin, runnerId);
    expect(await runnerEvents(live)).toEqual([{ runnerId, status: 'offline' }]);
  });
});
