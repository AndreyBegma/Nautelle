import {
  rememberableToolRules,
  toolUseCallOf,
  toolUseDanger,
} from '@nautelle/shared';
import {
  DEMO_AWAY_SESSION_ID,
  DEMO_CARDS,
  DEMO_FAILED_RUNS,
  DEMO_PROJECT_ID,
  DEMO_TOOL_CALLS,
  DemoDataError,
  demoDatabaseUrl,
  isDemoDatabase,
  maintenanceUrl,
  seedDemo,
} from './demo-data';

const BASE =
  'postgresql://postgres:secret@localhost:5421/agentdock?schema=public';

describe('demo database names', () => {
  it('accepts only agentdock_demo and agentdock_demo_<id>', () => {
    expect(isDemoDatabase('agentdock_demo')).toBe(true);
    expect(isDemoDatabase('agentdock_demo_gulbtfoj')).toBe(true);
    for (const name of [
      'agentdock',
      'agentdock_test',
      'agentdock_demo_',
      'agentdock_demo_Card',
      'agentdock_demo_x"; DROP DATABASE agentdock; --',
      '',
    ]) {
      expect(isDemoDatabase(name)).toBe(false);
    }
  });

  it('swaps only the database of the dev URL', () => {
    expect(demoDatabaseUrl(BASE, 'agentdock_demo_abc123')).toBe(
      'postgresql://postgres:secret@localhost:5421/agentdock_demo_abc123?schema=public',
    );
  });

  it('refuses a name that is not a demo database', () => {
    expect(() => demoDatabaseUrl(BASE, 'agentdock')).toThrow(DemoDataError);
  });

  it('connects to the maintenance database without query options', () => {
    expect(maintenanceUrl(BASE)).toBe(
      'postgresql://postgres:secret@localhost:5421/postgres',
    );
  });
});

describe('seedDemo', () => {
  const prisma = () => ({
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
    runner: { upsert: jest.fn() },
    project: { upsert: jest.fn() },
    boardSettings: { upsert: jest.fn() },
    boardCard: { upsert: jest.fn().mockResolvedValue({ id: 'c1' }) },
    run: { upsert: jest.fn() },
    boardCardRound: { upsert: jest.fn() },
    agentSession: { upsert: jest.fn() },
    actionRequest: { upsert: jest.fn() },
    toolUseRule: { upsert: jest.fn() },
    taskDesign: { upsert: jest.fn().mockResolvedValue({ id: 'd1' }) },
    planTurn: { upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    designRevision: { upsert: jest.fn().mockResolvedValue({ id: 'r1' }) },
    designFrame: { upsert: jest.fn() },
    boardRunQueueCard: { upsert: jest.fn() },
  });

  it('upserts the runner, the project and every card by a fixed key', async () => {
    const db = prisma();
    const seeded = await seedDemo(db as never, ' Demo@Example.com ');

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'demo@example.com' },
    });
    expect(seeded).toEqual({
      projectId: DEMO_PROJECT_ID,
      cards: DEMO_CARDS.length,
    });
    expect(db.boardCard.upsert).toHaveBeenCalledTimes(DEMO_CARDS.length);
    for (const call of db.boardCard.upsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });

  it("seeds the finished card's round with its model and effort (C-359)", async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const withRound = DEMO_CARDS.filter((card) => card.round);
    expect(db.run.upsert).toHaveBeenCalledTimes(
      withRound.length +
        DEMO_FAILED_RUNS.length +
        DEMO_CARDS.filter((card) => card.design).length,
    );
    expect(db.boardCardRound.upsert).toHaveBeenCalledTimes(withRound.length);
    const rounds = db.boardCardRound.upsert.mock.calls.map(([arg]) => arg);
    for (const round of rounds) expect(round.update).toEqual({});
    expect(rounds.map((round) => round.create)).toContainEqual(
      expect.objectContaining({
        cardId: 'c1',
        phase: 'finished',
        model: 'claude-opus-5-5',
        effort: 'high',
      }),
    );
  });

  it('fills the one slot with a running card and queues two To Do cards behind it (C-398)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');

    expect(db.boardSettings.upsert).toHaveBeenCalledWith({
      where: { projectId: DEMO_PROJECT_ID },
      update: {},
      create: { projectId: DEMO_PROJECT_ID, maxRunning: 1 },
    });
    const rounds = db.boardCardRound.upsert.mock.calls.map(([arg]) => arg);
    expect(
      rounds.filter((round) => round.create.phase === 'running'),
    ).toHaveLength(1);
    const queued = db.boardRunQueueCard.upsert.mock.calls.map(([arg]) => arg);
    expect(queued).toHaveLength(2);
    for (const entry of queued) {
      expect(entry.update).toEqual({});
      expect(entry.create).toMatchObject({
        status: 'queued',
        queuedById: 'u1',
        queuedByRole: 'admin',
      });
    }
  });

  it('seeds a card a hard budget paused, keeping its branch and session (C-399)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const number = DEMO_CARDS.findIndex((card) => card.round?.paused) + 1;
    expect(number).toBeGreaterThan(0);
    const [card] = db.boardCard.upsert.mock.calls[number - 1];
    expect(card.create).toMatchObject({
      column: 'in_progress',
      branch: expect.any(String),
      sessionId: expect.any(String),
    });
    const run = db.run.upsert.mock.calls
      .map(([args]) => args)
      .find((args) => args.create.status === 'abandoned');
    expect(run?.create).toMatchObject({
      status: 'abandoned',
      outcome: 'Paused: a hard budget was reached',
    });
    const [round] = db.boardCardRound.upsert.mock.calls.at(-1);
    expect(round.create).toMatchObject({
      phase: 'cancelled',
      pausedFor: 'budget',
    });
  });

  it('seeds a Finished card whose PR merged, for the sweep to complete (C-389)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const merged = db.boardCard.upsert.mock.calls
      .map(([args]) => args.create)
      .filter((card) => card.prState === 'merged');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ column: 'finished', prNumber: 42 });
    expect(merged[0].mergedAt).toBeInstanceOf(Date);
  });

  it('seeds a failed card run and a failed Steward run (C-389)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const failed = db.run.upsert.mock.calls
      .map(([args]) => args.create)
      .filter((run) => run.status === 'failed')
      .map((run) => run.kind);
    expect(failed).toEqual(['card', 'steward']);
  });

  it('seeds an away session waiting on tool calls and a project rule (C-401)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const [project] = db.project.upsert.mock.calls[0];
    expect(project.create.toolUseTimeoutMinutes).toBe(240);
    expect(db.agentSession.upsert).toHaveBeenCalledTimes(1);
    const requests = db.actionRequest.upsert.mock.calls.map(
      ([args]) => args.create,
    );
    expect(requests).toHaveLength(DEMO_TOOL_CALLS.length);
    for (const request of requests) {
      expect(request).toMatchObject({
        kind: 'tool_use',
        sessionId: DEMO_AWAY_SESSION_ID,
      });
      expect(toolUseCallOf(request.args)).not.toBeNull();
    }
    // The first offers its suggested rule; reading `.env` always asks.
    const [suggested, secret] = requests;
    expect(
      rememberableToolRules(
        toolUseCallOf(suggested.args),
        suggested.args.suggestions,
      ),
    ).toEqual({
      ok: true,
      rules: [{ toolName: 'Bash', ruleContent: 'bun run test:*' }],
    });
    const secretCall = toolUseCallOf(secret.args);
    expect(secretCall && toolUseDanger(secretCall)?.kind).toBe('secret_read');
    const [rule] = db.toolUseRule.upsert.mock.calls[0];
    expect(rule.create).toMatchObject({ scope: 'project', toolName: 'Bash' });
  });

  it('seeds a card whose design waits for approval (C-394)', async () => {
    const db = prisma();
    await seedDemo(db as never, 'demo@example.com');
    const [design] = db.taskDesign.upsert.mock.calls[0];
    expect(design.create).toMatchObject({
      cardId: 'c1',
      needed: true,
      status: 'reviewing',
    });
    expect(db.designRevision.upsert).toHaveBeenCalledTimes(1);
    expect(db.designFrame.upsert).toHaveBeenCalledTimes(1);
  });

  it('needs the admin to exist', async () => {
    const db = prisma();
    db.user.findUnique.mockResolvedValue(null);
    await expect(seedDemo(db as never, 'demo@example.com')).rejects.toThrow(
      DemoDataError,
    );
  });
});
