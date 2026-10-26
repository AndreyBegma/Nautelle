import { ACTIVE_CARD_ROUND_PHASES } from '@nautelle/shared';
import {
  Injectable,
  Logger,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type BudgetStop, BudgetStops } from '../budgets/budget-stops';
import { PrismaService } from '../database/prisma.service';
import { BoardWork } from './board-work';

/**
 * C-399 (ADR-0101): a hard budget that is reached pauses the running card
 * rounds in its scope — a project budget the project's, a user budget the
 * rounds that count toward that user (spec 28 D3: the run's
 * `triggeredById`). Each is paused by `BoardWork.pause`; Resume is the
 * card's Run, which the budget gate refuses until the budget allows.
 * Budgets emit a stop on every evaluation that finds one, so a round whose
 * runner could not be reached is paused on the next.
 */
@Injectable()
export class BoardBudgetPause implements OnModuleInit {
  private readonly logger = new Logger(BoardBudgetPause.name);
  /** Cards being paused now, so two evaluations stop one session once. */
  private readonly pausing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly work: BoardWork,
    @Optional() private readonly stops?: BudgetStops,
  ) {}

  onModuleInit(): void {
    this.stops?.subscribe((stop) => {
      // `BoardWork.settled` waits for it, as for a collect.
      this.work.background(this.pauseFor(stop).then(() => undefined));
    });
  }

  /** Pauses every active round in the stop's scope; the number paused. */
  async pauseFor(stop: BudgetStop): Promise<number> {
    const rounds = await this.prisma.boardCardRound.findMany({
      where: {
        phase: { in: [...ACTIVE_CARD_ROUND_PHASES] },
        ...this.scopeOf(stop),
      },
      select: {
        id: true,
        card: { select: { id: true, projectId: true, number: true } },
      },
    });
    let paused = 0;
    for (const round of rounds) {
      if (this.pausing.has(round.card.id)) continue;
      this.pausing.add(round.card.id);
      try {
        if (await this.pauseRound(round.id, round.card, stop)) paused++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `card ${round.card.id} not paused for budget ${stop.budgetId}: ${reason}`,
        );
      } finally {
        this.pausing.delete(round.card.id);
      }
    }
    return paused;
  }

  private scopeOf(stop: BudgetStop): Prisma.BoardCardRoundWhereInput {
    if (stop.scope === 'project') {
      return { card: { projectId: stop.projectId ?? '' } };
    }
    return { run: { triggeredById: stop.userId ?? '' } };
  }

  private async pauseRound(
    roundId: string,
    card: { projectId: string; number: number },
    stop: BudgetStop,
  ): Promise<boolean> {
    const project = await this.work.project(card.projectId);
    const fresh = await this.work.card(card.projectId, card.number);
    // Only the card's latest round is its worker.
    if (fresh.rounds[0]?.id !== roundId) return false;
    return this.work.pause(project, fresh, stop);
  }
}
