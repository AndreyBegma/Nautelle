import {
  BOARD_ERROR,
  type BoardStackDetail,
  type CardRoundPhase,
  cardLabel,
  isStackGated,
  type Role,
  type StackRunPause,
  stackLabel,
} from '@nautelle/shared';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { BoardStackRun, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SYSTEM_ACTOR, systemActorFor } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { RunnerConnectHooks } from '../runners/runner-connect-hooks';
import { BoardCommands } from './board-commands';
import { BoardDependencies } from './board-dependencies.service';
import { autoRunFailureOf, boardError } from './board-error';
import { toSettingsView } from './board-mapper';
import { BoardRoundsService } from './board-rounds.service';
import { shippingAutoStart } from './board-shipping';
import { BoardStacks } from './board-stacks';
import { ACTIVE_PHASES, type BoardActor, BoardWork } from './board-work';
import type { RunBoardCardDto } from './dto';

/** #652: how often the run queue is re-evaluated without a card change. */
export const STACK_RUN_SWEEP_MS = 60_000;

/** #652: a round the run started that ended in one of these paused it. */
const FAILED_PHASES: ReadonlySet<CardRoundPhase> = new Set(['failed', 'ended']);

/** #652: refusals that leave a queued card queued — it waits, nothing failed. */
const WAITS_FOR_DEPENDENCY: ReadonlySet<string> = new Set([
  BOARD_ERROR.dependencyOpen,
  BOARD_ERROR.dependenciesUnmerged,
]);

const MESSAGE_MAX = 500;

/** What a tick reads of a queued card. */
const ENTRY_SELECT = {
  id: true,
  status: true,
  roundId: true,
  card: {
    select: {
      id: true,
      number: true,
      column: true,
      position: true,
      rounds: {
        orderBy: { round: 'desc' },
        take: 1,
        select: { id: true, phase: true },
      },
    },
  },
} as const;

/** What a tick reads of a running stack run. */
const RUN_INCLUDE = {
  stack: { select: { id: true, number: true } },
  cards: { select: ENTRY_SELECT },
} as const;

/** C-398: what a tick reads of a card queued on its own. */
const SOLO_SELECT = {
  ...ENTRY_SELECT,
  queuedById: true,
  queuedByRole: true,
  options: true,
  autoRunAfter: true,
} as const;

type RunEntry = {
  id: string;
  status: 'queued' | 'waiting' | 'started';
  roundId: string | null;
  card: {
    id: string;
    number: number;
    column: string;
    position: number;
    rounds: { id: string; phase: CardRoundPhase }[];
  };
};

type SoloEntry = RunEntry & {
  queuedById: string | null;
  queuedByRole: string | null;
  options: Prisma.JsonValue;
  autoRunAfter: number | null;
};

type RunWithCards = BoardStackRun & {
  stack: { id: string; number: number };
  cards: RunEntry[];
};

/** A queued card a tick may start: of a stack run, or queued on its own. */
type Candidate =
  | { run: RunWithCards; entry: RunEntry }
  | { run: null; entry: SoloEntry };

/** The person who pressed Run stack, or Run, as the queued cards start. */
const actorOf = (userId: string | null, role: string | null) =>
  ({
    userId,
    role: (role === 'admin' ? 'admin' : 'operator') as Role,
    ctx: { actor: userId !== null ? systemActorFor(userId) : SYSTEM_ACTOR },
  }) satisfies BoardActor;

const runActorOf = (
  run: Pick<BoardStackRun, 'startedById' | 'startedByRole'>,
) => actorOf(run.startedById, run.startedByRole);

/** C-398: the stored launch choices of a card queued on its own. */
const optionsOf = (options: Prisma.JsonValue): RunBoardCardDto =>
  options !== null && typeof options === 'object' && !Array.isArray(options)
    ? (options as RunBoardCardDto)
    : {};

/**
 * The Board's run queue (#652, C-398 — ADR-0067, ADR-0101). Two things put a
 * card in it (`board_run_queue`): Run stack, which queues the stack's To Do
 * cards under the stack's run, and a Run refused with `max_running`, which
 * queues that To Do card on its own (`BoardRoundsService.run`). On every card
 * change of the project — a round finishing, a PR opening, a merge, an
 * acceptance, a slot freeing, a card dragged within To Do — the queue is
 * re-evaluated: a card whose dependencies allow it under the stacked-branch
 * rules (`assertRunnable`) starts through `BoardRoundsService.runNow`, in To
 * Do order, while the project has room under `maxRunning`. A `max_running`
 * refusal leaves it queued and an open dependency leaves it waiting. Any
 * other refusal, or a round a stack run started that fails, pauses that stack
 * run until a person presses Run stack again; a card queued on its own leaves
 * the queue with the refusal stored on the card. Stop removes queued cards
 * and leaves running ones alone. The queue survives a restart: bootstrap
 * resumes it.
 */
@Injectable()
export class BoardRunQueue
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BoardRunQueue.name);
  /** Each project's evaluation in flight; one at a time per project. */
  private readonly ticking = new Map<string, Promise<void>>();
  /** Projects changed while their evaluation ran: it runs once more. */
  private readonly again = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly work: BoardWork,
    private readonly rounds: BoardRoundsService,
    private readonly stacks: BoardStacks,
    private readonly dependencies: BoardDependencies,
    private readonly audit: AuditService,
    private readonly commands: BoardCommands,
    private readonly connectHooks: RunnerConnectHooks,
  ) {}

  onModuleInit(): void {
    this.work.onChanged((projectId) => {
      void this.nudge(projectId);
    });
    // A run waits while its runner is away; it goes on when the runner is back.
    this.connectHooks.register({
      name: 'board-run-queue',
      connected: (runnerId) => this.resumeAll(runnerId),
    });
  }

  /** Resumes the run queue, then sweeps it now and then. */
  onApplicationBootstrap(): void {
    if (!shippingAutoStart()) return;
    void this.resumeAll();
    this.timer = setInterval(() => void this.resumeAll(), STACK_RUN_SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Every project with a running stack run or a card queued on its own — of
   * `runnerId`, if given — is evaluated.
   */
  async resumeAll(runnerId?: string): Promise<void> {
    try {
      const of = runnerId ? { project: { runnerId } } : {};
      const [runs, solo] = await Promise.all([
        this.prisma.boardStackRun.findMany({
          where: { state: 'running', stack: of },
          select: { stack: { select: { projectId: true } } },
        }),
        this.prisma.boardRunQueueCard.findMany({
          where: { runId: null, card: of },
          select: { card: { select: { projectId: true } } },
        }),
      ]);
      const projects = new Set([
        ...runs.map((r) => r.stack.projectId),
        ...solo.map((e) => e.card.projectId),
      ]);
      await Promise.all([...projects].map((p) => this.nudge(p)));
    } catch (error) {
      this.logger.error(
        'resuming the run queue failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * `POST /board/stacks/:number/run`: queues every To Do card of the stack
   * not queued yet, clears a pause, and starts what is ready. Pressing it
   * again on a paused or stopped run resumes from the cards left. Refused
   * with 409 `stack_design_not_approved` while the stack design is needed
   * and not approved.
   */
  async start(
    projectId: string,
    number: number,
    actor: BoardActor,
  ): Promise<BoardStackDetail> {
    const stack = await this.prisma.boardStack.findUnique({
      where: { projectId_number: { projectId, number } },
      select: {
        id: true,
        number: true,
        title: true,
        design: { select: { needed: true, status: true } },
        stages: {
          select: {
            cards: { select: { id: true, number: true, column: true } },
          },
        },
      },
    });
    if (!stack) throw boardError(404, BOARD_ERROR.notFound, 'Stack not found');
    if (isStackGated(stack.design)) {
      throw boardError(
        409,
        BOARD_ERROR.stackDesignNotApproved,
        `${stackLabel(stack.number)} "${stack.title}": the stack design is not approved yet`,
      );
    }
    const todo = stack.stages
      .flatMap((s) => s.cards)
      .filter((c) => c.column === 'todo')
      .sort((a, b) => a.number - b.number);
    const now = new Date();
    const added = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM board_stacks WHERE id = ${stack.id} FOR UPDATE`;
      const run = await tx.boardStackRun.upsert({
        where: { stackId: stack.id },
        create: {
          stackId: stack.id,
          state: 'running',
          startedById: actor.userId,
          startedByRole: actor.role,
          startedAt: now,
        },
        update: {
          state: 'running',
          startedById: actor.userId,
          startedByRole: actor.role,
          startedAt: now,
          pausedCode: null,
          pausedMessage: null,
          pausedCardId: null,
          pausedAt: null,
        },
      });
      // A card the run started earlier whose round is over is history now.
      const entries = await tx.boardRunQueueCard.findMany({
        where: { runId: run.id },
        select: {
          id: true,
          cardId: true,
          status: true,
          roundId: true,
        },
      });
      const started = entries.filter((e) => e.status === 'started');
      const live = new Set(
        (
          await tx.boardCardRound.findMany({
            where: {
              id: { in: started.flatMap((e) => e.roundId ?? []) },
              phase: { in: ACTIVE_PHASES },
            },
            select: { id: true },
          })
        ).map((r) => r.id),
      );
      const over = started.filter(
        (e) => e.roundId === null || !live.has(e.roundId),
      );
      if (over.length > 0) {
        await tx.boardRunQueueCard.deleteMany({
          where: { id: { in: over.map((e) => e.id) } },
        });
      }
      const kept = new Set(
        entries.filter((e) => !over.includes(e)).map((e) => e.cardId),
      );
      const add = todo.filter((c) => !kept.has(c.id));
      if (add.length > 0) {
        // C-398: a card queued on its own joins the stack's run.
        await tx.boardRunQueueCard.deleteMany({
          where: { runId: null, cardId: { in: add.map((c) => c.id) } },
        });
        await tx.boardRunQueueCard.createMany({
          data: add.map((c) => ({ runId: run.id, cardId: c.id })),
          skipDuplicates: true,
        });
      }
      return add;
    });
    await this.audit.record({
      ...actor.ctx,
      action: 'stack.run_started',
      target: { type: 'board_stack', id: stack.id },
      projectId,
      after: { number: stack.number, cards: added.map((c) => c.number) },
      result: 'ok',
    });
    this.work.publishStack(projectId, stack.id);
    await this.nudge(projectId);
    return this.stacks.detail(projectId, number);
  }

  /**
   * `POST /board/stacks/:number/stop`: removes the cards still queued; the
   * cards the run already started keep running. Run stack resumes later.
   */
  async stop(
    projectId: string,
    number: number,
    actor: BoardActor,
  ): Promise<BoardStackDetail> {
    const stack = await this.prisma.boardStack.findUnique({
      where: { projectId_number: { projectId, number } },
      select: { id: true, number: true, run: { select: { id: true } } },
    });
    if (!stack) throw boardError(404, BOARD_ERROR.notFound, 'Stack not found');
    const run = stack.run;
    if (run) {
      const removed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM board_stack_runs WHERE id = ${run.id} FOR UPDATE`;
        const queued = await tx.boardRunQueueCard.findMany({
          where: { runId: run.id, status: { in: ['queued', 'waiting'] } },
          select: { id: true, card: { select: { number: true } } },
        });
        await tx.boardRunQueueCard.deleteMany({
          where: { id: { in: queued.map((q) => q.id) } },
        });
        await tx.boardStackRun.update({
          where: { id: run.id },
          data: {
            state: 'stopped',
            pausedCode: null,
            pausedMessage: null,
            pausedCardId: null,
            pausedAt: null,
          },
        });
        return queued.map((q) => q.card.number).sort((a, b) => a - b);
      });
      await this.audit.record({
        ...actor.ctx,
        action: 'stack.run_stopped',
        target: { type: 'board_stack', id: stack.id },
        projectId,
        after: { number: stack.number, removed },
        result: 'ok',
      });
      this.work.publishStack(projectId, stack.id);
    }
    return this.stacks.detail(projectId, number);
  }

  /**
   * Evaluates the project's run queue — at once, or once more after the
   * evaluation in flight. Resolves when the project is evaluated.
   */
  nudge(projectId: string): Promise<void> {
    const ticking = this.ticking.get(projectId);
    if (ticking) {
      this.again.add(projectId);
      return ticking;
    }
    const work = (async () => {
      do {
        this.again.delete(projectId);
        await this.tick(projectId);
      } while (this.again.has(projectId));
    })()
      .catch((error: unknown) => {
        this.logger.error(
          `the run queue of project ${projectId} was not evaluated`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.ticking.delete(projectId);
        if (this.again.has(projectId)) void this.nudge(projectId);
      });
    this.ticking.set(projectId, work);
    this.work.background(work);
    return work;
  }

  /** One evaluation of the project's run queue. */
  private async tick(projectId: string): Promise<void> {
    const [runs, solo] = await Promise.all([
      this.prisma.boardStackRun.findMany({
        where: { state: 'running', stack: { projectId } },
        include: RUN_INCLUDE,
        orderBy: { stack: { number: 'asc' } },
      }),
      this.prisma.boardRunQueueCard.findMany({
        where: { runId: null, card: { projectId } },
        select: SOLO_SELECT,
      }),
    ]);
    if (runs.length === 0 && solo.length === 0) return;
    const changed = new Set<string>();
    const changedCards = new Set<string>();
    const paused = new Set<string>();

    // A round the run started that failed pauses it.
    const startedRounds = runs.flatMap((run) =>
      run.cards.flatMap((e) =>
        e.status === 'started' && e.roundId ? [e.roundId] : [],
      ),
    );
    const rounds = new Map(
      (
        await this.prisma.boardCardRound.findMany({
          where: { id: { in: startedRounds } },
          select: { id: true, phase: true, error: true },
        })
      ).map((r) => [r.id, r]),
    );
    for (const run of runs) {
      for (const entry of run.cards) {
        const round = entry.roundId ? rounds.get(entry.roundId) : undefined;
        if (entry.status !== 'started' || !round) continue;
        if (!FAILED_PHASES.has(round.phase)) continue;
        await this.pause(projectId, run, entry.card, {
          code: 'round_failed',
          message: `The round of ${cardLabel(entry.card.number)} ${
            round.phase === 'failed' ? 'failed' : 'ended before it finished'
          }${round.error ? `: ${round.error}` : ''}`,
        });
        paused.add(run.id);
        break;
      }
    }

    // A queued card a person started or moved on is the run's no more to start.
    for (const run of runs) {
      for (const entry of run.cards) {
        if (entry.status === 'started' || entry.card.column === 'todo') {
          continue;
        }
        const latest = entry.card.rounds[0];
        if (latest && ACTIVE_PHASES.some((p) => p === latest.phase)) {
          await this.prisma.boardRunQueueCard.update({
            where: { id: entry.id },
            data: { status: 'started', roundId: latest.id },
          });
          entry.status = 'started';
          entry.roundId = latest.id;
        } else {
          await this.prisma.boardRunQueueCard.delete({
            where: { id: entry.id },
          });
        }
        changed.add(run.stack.id);
      }
    }
    // C-398: a card queued on its own that left To Do leaves the queue.
    const left = solo.filter((e) => e.card.column !== 'todo');
    if (left.length > 0) {
      await this.prisma.boardRunQueueCard.deleteMany({
        where: { id: { in: left.map((e) => e.id) } },
      });
      for (const entry of left) changedCards.add(entry.card.id);
    }

    // Start what is ready, in To Do order, while there is room.
    const candidates: Candidate[] = [
      ...runs.flatMap((run) =>
        run.cards
          .filter((e) => e.status !== 'started' && e.card.column === 'todo')
          .map((entry) => ({ run, entry })),
      ),
      ...solo
        .filter((e) => e.card.column === 'todo')
        .map((entry) => ({ run: null, entry })),
    ].sort(
      (a, b) =>
        a.entry.card.position - b.entry.card.position ||
        a.entry.card.number - b.entry.card.number,
    );
    // Without its runner nothing starts, and nothing pauses: the run waits.
    const { runnerId } = await this.work.project(projectId);
    let held = !this.commands.isConnected(runnerId);
    for (const candidate of candidates) {
      const { run, entry } = candidate;
      if (run !== null && paused.has(run.id)) continue;
      const touched = () =>
        run !== null
          ? changed.add(run.stack.id)
          : changedCards.add(entry.card.id);
      const ready = await this.isReady(entry.card.id);
      if (!ready) {
        if (await this.setStatus(entry, 'waiting')) touched();
        continue;
      }
      if (await this.setStatus(entry, 'queued')) touched();
      if (held || !(await this.hasRoom(projectId))) {
        held = true;
        continue;
      }
      try {
        if (candidate.run !== null) {
          await this.rounds.runNow(
            projectId,
            entry.card.number,
            {},
            runActorOf(candidate.run),
          );
        } else {
          const solo = candidate.entry;
          await this.rounds.runNow(
            projectId,
            entry.card.number,
            optionsOf(solo.options),
            actorOf(solo.queuedById, solo.queuedByRole),
            solo.autoRunAfter,
          );
        }
      } catch (error) {
        const { code, message } = autoRunFailureOf(error);
        if (code === BOARD_ERROR.maxRunning) {
          held = true;
          continue;
        }
        if (WAITS_FOR_DEPENDENCY.has(code)) {
          if (await this.setStatus(entry, 'waiting')) touched();
          continue;
        }
        if (candidate.run !== null) {
          this.logger.warn(
            `${stackLabel(candidate.run.stack.number)}: ${cardLabel(entry.card.number)} did not start: ${message}`,
          );
          await this.pause(projectId, candidate.run, entry.card, {
            code,
            message,
          });
          paused.add(candidate.run.id);
        } else {
          await this.refuse(projectId, candidate.entry, { code, message });
        }
        continue;
      }
      if (candidate.run === null) {
        // C-398: a card queued on its own is done with the queue once it runs.
        await this.prisma.boardRunQueueCard.deleteMany({
          where: { id: entry.id },
        });
        changedCards.add(entry.card.id);
        continue;
      }
      const round = await this.prisma.boardCardRound.findFirst({
        where: { cardId: entry.card.id },
        orderBy: { round: 'desc' },
        select: { id: true },
      });
      await this.prisma.boardRunQueueCard.update({
        where: { id: entry.id },
        data: { status: 'started', roundId: round?.id ?? null },
      });
      entry.status = 'started';
      entry.roundId = round?.id ?? null;
      changed.add(candidate.run.stack.id);
    }

    // A run with nothing left to start and nothing it started still running is done.
    for (const run of runs) {
      if (paused.has(run.id)) continue;
      if (run.cards.some((e) => e.status !== 'started')) continue;
      const running = await this.prisma.boardCardRound.count({
        where: {
          id: { in: run.cards.flatMap((e) => e.roundId ?? []) },
          phase: { in: ACTIVE_PHASES },
        },
      });
      if (running > 0) continue;
      const { count } = await this.prisma.boardStackRun.updateMany({
        where: { id: run.id, state: 'running' },
        data: { state: 'done' },
      });
      if (count > 0) changed.add(run.stack.id);
    }

    for (const stackId of changed) this.work.publishStack(projectId, stackId);
    for (const cardId of changedCards) this.work.publish(projectId, cardId);
  }

  /**
   * C-398: a card queued on its own whose start was refused for a reason
   * other than a full Board or an open dependency leaves the queue; the
   * refusal is stored on the card (`autoRunFailure`) and audited, like a
   * refused Auto-run.
   */
  private async refuse(
    projectId: string,
    entry: SoloEntry,
    reason: { code: string; message: string },
  ): Promise<void> {
    const message = reason.message.slice(0, MESSAGE_MAX);
    this.logger.warn(
      `queued ${cardLabel(entry.card.number)} did not start: ${message}`,
    );
    await this.prisma.$transaction([
      this.prisma.boardRunQueueCard.deleteMany({ where: { id: entry.id } }),
      this.prisma.boardCard.update({
        where: { id: entry.card.id },
        data: {
          autoRunError: reason.code,
          autoRunMessage: message,
          autoRunFailedAt: new Date(),
          autoRunAfter: entry.autoRunAfter,
          autoRunStack: null,
        },
      }),
    ]);
    await this.audit.record({
      ...actorOf(entry.queuedById, entry.queuedByRole).ctx,
      action: 'card.auto_run_failed',
      target: { type: 'board_card', id: entry.card.id },
      projectId,
      // `code` is a redacted audit key (auth codes): the refusal goes as `error`.
      after: {
        number: entry.card.number,
        error: reason.code,
        after: entry.autoRunAfter,
        queued: true,
      },
      result: 'error',
      meta: { message },
    });
  }

  /**
   * `assertRunnable` under the stacked-branch rules lets the card start: one
   * dependency that finished its round with an open PR (stacked on its
   * branch), or every dependency merged. A card with several dependencies
   * is not stacked on the one left unmerged: it waits for all of them.
   */
  private async isReady(cardId: string): Promise<boolean> {
    try {
      const stacked = await this.dependencies.assertRunnable(cardId);
      if (stacked === null) return true;
      const deps = await this.prisma.boardCardDependency.count({
        where: { cardId },
      });
      return deps === 1;
    } catch (error) {
      if (WAITS_FOR_DEPENDENCY.has(autoRunFailureOf(error).code)) return false;
      throw error;
    }
  }

  /** Fewer active rounds than `maxRunning` — what `assertRoom` checks. */
  private async hasRoom(projectId: string): Promise<boolean> {
    const [settings, active] = await Promise.all([
      this.prisma.boardSettings.findUnique({ where: { projectId } }),
      this.prisma.boardCardRound.count({
        where: { phase: { in: ACTIVE_PHASES }, card: { projectId } },
      }),
    ]);
    return active < toSettingsView(projectId, settings).maxRunning;
  }

  /** Stores a queued card's readiness; whether it changed. */
  private async setStatus(
    entry: RunEntry,
    status: 'queued' | 'waiting',
  ): Promise<boolean> {
    if (entry.status === status) return false;
    await this.prisma.boardRunQueueCard.update({
      where: { id: entry.id },
      data: { status },
    });
    entry.status = status;
    return true;
  }

  /**
   * Pauses the run with the reason, shows a refused start on the card
   * (`autoRunFailure` with `stack`), and audits `stack.run_paused`.
   */
  private async pause(
    projectId: string,
    run: BoardStackRun & { stack: { id: string; number: number } },
    card: { id: string; number: number },
    reason: Pick<StackRunPause, 'code' | 'message'>,
  ): Promise<void> {
    const message = reason.message.slice(0, MESSAGE_MAX);
    const now = new Date();
    const { count } = await this.prisma.boardStackRun.updateMany({
      where: { id: run.id, state: 'running' },
      data: {
        state: 'paused',
        pausedCode: reason.code,
        pausedMessage: message,
        pausedCardId: card.id,
        pausedAt: now,
      },
    });
    if (count === 0) return;
    if (reason.code !== 'round_failed') {
      await this.prisma.boardCard.update({
        where: { id: card.id },
        data: {
          autoRunError: reason.code,
          autoRunMessage: message,
          autoRunFailedAt: now,
          autoRunAfter: null,
          autoRunStack: run.stack.number,
        },
      });
    }
    await this.audit.record({
      ...runActorOf(run).ctx,
      action: 'stack.run_paused',
      target: { type: 'board_stack', id: run.stack.id },
      projectId,
      // `code` is a redacted audit key (auth codes): the reason goes as `error`.
      after: {
        number: run.stack.number,
        card: card.number,
        error: reason.code,
      },
      result: 'error',
      meta: { message },
    });
    this.work.publishStack(projectId, run.stack.id);
    this.work.publish(projectId, card.id);
  }
}
