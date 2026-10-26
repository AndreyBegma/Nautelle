import {
  analysisReportSummary,
  CARD_SUMMARY_MAX,
  type CardProposalInput,
  isActiveRoundPhase,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BOARD_SYSTEM_ACTOR, BoardWork } from './board-work';

/** A Claude session id of a card: a uuid, so it can be looked up as one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** C-503: `card.finish` from an analysis card's session — answered `analysis_expected`. */
export class CardAnalysisExpected extends Error {
  constructor() {
    super('an analysis card finishes with finish_analysis');
  }
}

export interface AnalysisFinish {
  report: string;
  proposals: CardProposalInput[];
  /** Set only by the runner daemon's read-only guard (C-504). */
  readOnlyViolation?: boolean;
}

/**
 * C-503 (ADR-0126): an analysis card's finish. The worker's
 * `finish_analysis` stores the report on the active round, replaces the
 * card's `pending` proposals with the new ones and moves the card to
 * Finished — in one transaction, with no collect, so no pull request,
 * review step, demo or issue follows.
 */
@Injectable()
export class BoardAnalysis {
  constructor(
    private readonly prisma: PrismaService,
    private readonly work: BoardWork,
  ) {}

  /**
   * The card is the analysis card whose Claude session asks — `session.id` —
   * in the asking runner's project; any other session is `null`. A round
   * already finished stays as it is: `proposals` then counts the pending ones
   * stored.
   */
  async finishByWorker(
    project: { id: string; runnerId: string },
    sessionId: string,
    finish: AnalysisFinish,
  ): Promise<{ number: number; proposals: number } | null> {
    if (!UUID.test(sessionId)) return null;
    const card = await this.prisma.boardCard.findFirst({
      where: {
        projectId: project.id,
        sessionId,
        kind: 'analysis',
        project: { runnerId: project.runnerId },
      },
      include: { rounds: { orderBy: { round: 'desc' } } },
    });
    if (!card) return null;
    const round = card.rounds[0];
    if (!round || !isActiveRoundPhase(round.phase)) {
      const pending = await this.prisma.boardCardProposal.count({
        where: { cardId: card.id, status: 'pending' },
      });
      return { number: card.number, proposals: pending };
    }
    const summary = analysisReportSummary(finish.report, CARD_SUMMARY_MAX);
    const target = await this.work.project(project.id);
    await this.work.move(
      target,
      card,
      {
        to: 'finished',
        index: 0,
        source: 'automatic',
        finishedBy: 'worker',
        summary,
        // ADR-0126: an analysis card has nothing to collect.
        collect: false,
        within: async (tx, fresh) => {
          const active = fresh.rounds[0];
          if (!active || !isActiveRoundPhase(active.phase)) return;
          await tx.boardCardRound.update({
            where: { id: active.id },
            data: { report: finish.report },
          });
          // A created or dismissed proposal is the person's decision; it stays.
          await tx.boardCardProposal.deleteMany({
            where: { cardId: fresh.id, status: 'pending' },
          });
          if (finish.proposals.length > 0) {
            await tx.boardCardProposal.createMany({
              data: finish.proposals.map((proposal, position) => ({
                cardId: fresh.id,
                roundId: active.id,
                position,
                title: proposal.title,
                body: proposal.body,
                kind: proposal.kind,
                labels: proposal.labels ?? [],
                dependsOn: proposal.dependsOn ?? [],
              })),
            });
          }
          if (finish.readOnlyViolation === true) {
            await tx.run.update({
              where: { id: active.runId },
              data: { readOnlyViolation: true },
            });
          }
        },
        finishedAudit: { proposals: finish.proposals.length },
      },
      BOARD_SYSTEM_ACTOR,
    );
    return { number: card.number, proposals: finish.proposals.length };
  }
}
