import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CardCommandName,
  type CardReviewCommandName,
  type CommandName,
  commandNames,
} from '@nautelle/shared/protocol';
import type { CardHandlers } from '../cards';
import type { Exec } from '../detect/exec';
import { createDocsHandlers } from '../docs';
import { createPlannerHandlers, type PlanTurnExecutor } from '../planner';
import { permissivePolicy } from '../policy/testing';
import { type CodeAsker, createRepoHandlers } from '../repo';
import { createSkillHandlers, type SkillRunExecutor } from '../skills';
import { FakeClock } from '../testing/fake-clock';
import { fakeExec, memoryLogger } from '../testing/fixtures';
import {
  createUiProfileHandlers,
  type UiProfileBuildExecutor,
} from '../uiprofile';
import type { CommandHandlers } from './dispatcher';
import { CommandFailure } from './failure';
import { createHandlers, type HandlerContext } from './handlers';

const context = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  clock: new FakeClock(),
  runnerVersion: '0.1.0',
  host: { hostname: 'test-host', os: 'linux', arch: 'x64' },
  detectCapabilities: async () => ({
    tmux: null,
    git: null,
    gh: null,
    runtimes: { claude: null, codex: null },
    profiles: [],
    codeSentinel: null,
    otlp: null,
  }),
  exec: fakeExec({}),
  watchedProjects: () => [],
  profiles: () => [],
  policy: permissivePolicy,
  ...over,
});

const CARD = { cardId: 'card_1', projectId: 'prj_a' };
const cases: [CardCommandName | CardReviewCommandName, unknown][] = [
  ['card.stop', CARD],
  ['card.close', { ...CARD, removeWorktree: true }],
  ['card.reviewStop', { ...CARD, root: '/srv/app', shortId: 'ab12cd34' }],
  [
    'card.reviewPublish',
    {
      ...CARD,
      root: '/srv/app',
      prNumber: 7,
      headSha: 'a'.repeat(40),
      body: 'Review',
      comments: [],
    },
  ],
];

describe('cards.extract handler (#244)', () => {
  const args = {
    runId: 'run_1',
    projectId: 'prj_a',
    sessionId: '11111111-1111-4111-8111-111111111111',
    prompt: 'extract',
    profileKey: 'claude-work',
    model: 'haiku' as const,
    timeoutSec: 180,
  };

  it('answers unsupported on a runner without the capture executor', async () => {
    const handlers = createHandlers(context());
    const outcome = await Promise.resolve()
      .then(() => handlers['cards.extract'](args))
      .then(
        () => 'resolved',
        (error: unknown) =>
          error instanceof CommandFailure ? error.code : String(error),
      );
    expect(outcome).toBe('unsupported');
  });

  it('hands the command to the capture executor', async () => {
    const seen: string[] = [];
    const handlers = createHandlers(
      context({
        capture: {
          'cards.extract': async (a) => {
            seen.push(a.runId);
            return { phase: 'running' };
          },
        },
      }),
    );
    expect(await handlers['cards.extract'](args)).toEqual({
      phase: 'running',
    });
    expect(seen).toEqual(['run_1']);
  });
});

describe('card.demo handler (C-369)', () => {
  const args = {
    cardId: 'card_1',
    projectId: 'prj_a',
    card: 7,
    round: 1,
    demoId: 'demo_1',
    worktree: { root: '/srv/app', shortId: 'ab12cd34' },
    scenario: 'demoflow/cards/C-7-login.demo.json',
    env: [],
  };

  it('answers unsupported on a runner that does not record', async () => {
    const handlers = createHandlers(context());
    const outcome = await Promise.resolve()
      .then(() => handlers['card.demo'](args))
      .then(
        () => 'resolved',
        (error: unknown) =>
          error instanceof CommandFailure ? error.code : String(error),
      );
    expect(outcome).toBe('unsupported');
  });

  it('hands the command to the demo recorder', async () => {
    const handlers = createHandlers(
      context({
        demos: { 'card.demo': async () => ({ status: 'queued' as const }) },
      }),
    );
    expect(await handlers['card.demo'](args)).toEqual({ status: 'queued' });
  });
});

describe('card command handlers (#242)', () => {
  it('answers unsupported on a runner without the card executor', async () => {
    const handlers = createHandlers(context());
    for (const [name, args] of cases) {
      const outcome = await Promise.resolve()
        .then(() => (handlers[name] as (a: unknown) => unknown)(args))
        .then(
          () => 'resolved',
          (error: unknown) =>
            error instanceof CommandFailure ? error.code : String(error),
        );
      expect(outcome).toBe('unsupported');
    }
  });

  it('hands every card command to the card executor', async () => {
    const seen: string[] = [];
    const cards: CardHandlers = {
      'card.run': async () => {
        seen.push('card.run');
        return { phase: 'running', tmuxSession: 'nautelle-card-ab12cd34' };
      },
      'card.stop': async () => {
        seen.push('card.stop');
        return { stopped: true };
      },
      'card.collect': async () => {
        seen.push('card.collect');
        return { ahead: 0, pushed: false };
      },
      'card.close': async () => {
        seen.push('card.close');
        return { stopped: false, worktreeRemoved: true, branchDeleted: false };
      },
      'card.review': async () => {
        seen.push('card.review');
        return { phase: 'running', tmuxSession: 'nautelle-review-ab12cd34' };
      },
      'card.reviewStop': async () => {
        seen.push('card.reviewStop');
        return { stopped: true };
      },
    };
    const handlers = createHandlers(context({ cards }));
    expect(await handlers['card.stop'](CARD)).toEqual({ stopped: true });
    expect(
      await handlers['card.close']({ ...CARD, removeWorktree: true }),
    ).toEqual({ stopped: false, worktreeRemoved: true, branchDeleted: false });
    expect(
      await handlers['card.collect']({
        ...CARD,
        root: '/srv/app',
        base: 'main',
        branch: 'card/c1-x',
        number: 1,
        title: 'X',
        body: '',
      }),
    ).toEqual({ ahead: 0, pushed: false });
    expect(
      await handlers['card.reviewStop']({
        ...CARD,
        root: '/srv/app',
        shortId: 'ab12cd34',
      }),
    ).toEqual({ stopped: true });
    expect(seen).toEqual([
      'card.stop',
      'card.close',
      'card.collect',
      'card.reviewStop',
    ]);
  });
});

/** Calls `name` with `args` and `signal`, whatever it answers. */
const call = (
  handlers: CommandHandlers,
  name: CommandName,
  args: unknown,
  signal: AbortSignal,
): Promise<unknown> =>
  Promise.resolve()
    .then(() =>
      (handlers[name] as (a: unknown, s: AbortSignal) => unknown)(args, signal),
    )
    .catch(() => undefined);

describe("every handler receives the dispatcher's signal (#754 D2)", () => {
  it('hands it to the executor that serves the command', async () => {
    const seen = new Map<string, AbortSignal | undefined>();
    const record = (name: string, signal?: AbortSignal) => {
      seen.set(name, signal);
      return Promise.resolve({});
    };
    // Any command name it is asked for, recording what it was given.
    const group = <T>(): T =>
      new Proxy(
        {},
        {
          get: (_target, name) => (_args: unknown, signal?: AbortSignal) =>
            record(String(name), signal),
        },
      ) as T;
    const handlers = createHandlers(
      context({
        skills: group(),
        planner: group(),
        uiprofile: group(),
        cards: group(),
        capture: group(),
        normalize: group(),
        assess: group(),
        docs: group(),
        steward: group(),
        handoff: group(),
        repo: group(),
        prefix: group(),
        demos: group(),
        terminal: {
          attach: (_args, signal) => record('terminal.attach', signal) as never,
        },
        sessionMessage: {
          message: (_args, signal) =>
            record('session.message', signal) as never,
        },
      }),
    );
    const signal = new AbortController().signal;
    for (const name of commandNames) await call(handlers, name, {}, signal);
    expect(seen.size).toBeGreaterThanOrEqual(40);
    for (const [name, given] of seen) {
      expect({ name, same: given === signal }).toEqual({ name, same: true });
    }
  });

  // The handlers that spawn `git`, `gh` or `tmux` themselves.
  const SPAWNING: CommandName[] = [
    'project.inspect',
    'project.refresh',
    'project.push_check',
    'orchestrator.stop',
    'orchestrator.status',
    'orchestrator.message',
    'slot.stop',
    'slot.message',
    'issue.create',
    'pr.inspect',
    'pr.approve',
    'pr.requestChanges',
    'pr.voidApproval',
    'worktree.status',
    'card.merge',
    'card.prClose',
    'card.checks',
    'card.ciRetrigger',
    'card.prRetarget',
    'card.prOpen',
    'card.reviewPublish',
  ];

  it('runs every child of a spawning handler under it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nautelle-root-'));
    mkdirSync(join(root, '.git'));
    const args = {
      projectId: 'prj_a',
      cardId: 'card_1',
      root,
      path: root,
      slot: 'a',
      pr: 7,
      prNumber: 7,
      headSha: 'a'.repeat(40),
      branch: 'card/c1-x',
      base: 'main',
      title: 'A title',
      body: 'A body',
      text: 'hello',
      note: 'a note',
      by: 'someone',
      at: '2026-10-26T00:00:00.000Z',
      labels: [],
      queue: false,
      comments: [],
    };
    const signal = new AbortController().signal;
    const silent: string[] = [];
    const dropped: string[] = [];
    for (const name of SPAWNING) {
      const given: (AbortSignal | undefined)[] = [];
      const exec: Exec = async (_binary, _args, options) => {
        given.push(options?.signal);
        return null;
      };
      const handlers = createHandlers(
        context({
          exec,
          watchedProjects: () => [{ id: 'prj_a', root }],
          cards: {} as CardHandlers,
        }),
      );
      await call(handlers, name, args, signal);
      if (given.length === 0) silent.push(name);
      if (!given.every((s) => s === signal)) dropped.push(name);
    }
    expect(silent).toEqual([]);
    expect(dropped).toEqual([]);
  });

  // The subsystem handlers that spawn `git` / `gh` through the exec they are built with.
  const groupSpawning = (root: string): [CommandName, unknown][] => [
    ['skill.inspect', { source: 'acme/skills' }],
    [
      'skill.install',
      {
        source: 'acme/skills',
        skillId: 'estimate',
        commit: 'a'.repeat(40),
        contentHash: 'b'.repeat(64),
        target: {
          scope: 'project',
          projectId: 'prj_a',
          root,
          base: 'main',
          runtime: 'claude',
        },
      },
    ],
    ['skill.list', { projectId: 'prj_a', root }],
    ['repo.search', { projectId: 'prj_a', root, query: 'x' }],
    ['repo.read', { projectId: 'prj_a', root, path: 'README.md' }],
    ['uiprofile.fingerprint', { projectId: 'prj_a', root, globs: [] }],
    ['docs.publish_specs', { projectId: 'prj_a', root, docsRoot: tmpdir() }],
    ['docs.pr_state', { projectId: 'prj_a', root, docsRoot: tmpdir(), pr: 7 }],
    ['plan.publish_specs', { projectId: 'prj_a', root }],
    ['plan.queue_issues', { projectId: 'prj_a', root }],
  ];

  it('runs every child of a spawning subsystem handler under it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nautelle-root-'));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'README.md'), 'hello\n');
    const signal = new AbortController().signal;
    const silent: string[] = [];
    const dropped: string[] = [];
    for (const [name, args] of groupSpawning(root)) {
      const given: (AbortSignal | undefined)[] = [];
      const exec: Exec = async (_binary, _args, options) => {
        given.push(options?.signal);
        return null;
      };
      const deps = {
        exec,
        clock: new FakeClock(),
        home: root,
        profiles: () => [],
        watchedProjects: () => [{ id: 'prj_a', root }],
        fetch: (async () => new Response('{}')) as unknown as typeof fetch,
        tempRoot: root,
      };
      const handlers = createHandlers(
        context({
          exec,
          watchedProjects: deps.watchedProjects,
          skills: createSkillHandlers(deps, {} as SkillRunExecutor),
          planner: createPlannerHandlers(
            { ...deps, log: memoryLogger().log },
            {} as PlanTurnExecutor,
          ),
          uiprofile: createUiProfileHandlers(
            deps,
            {} as UiProfileBuildExecutor,
          ),
          docs: createDocsHandlers(deps),
          repo: createRepoHandlers(
            { ...deps, policy: permissivePolicy },
            {} as CodeAsker,
          ),
        }),
      );
      await call(handlers, name, args, signal);
      if (given.length === 0) silent.push(name);
      if (!given.every((s) => s === signal)) dropped.push(name);
    }
    expect(silent).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
