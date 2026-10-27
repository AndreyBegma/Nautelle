import {
  BOARD_CARD_KINDS,
  BOARD_ERROR,
  type BoardCardKind,
  type CardProposalKind,
  type CreateCardProposalsRequest,
  type CreateCardProposalsResponse,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import type { BoardCard, BoardCardProposal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BoardService } from './board.service';
import { boardError } from './board-error';
import type { CardWithRounds } from './board-mapper';
import { BoardPlanCards, type PlanCardDraft } from './board-plan-cards';
import { type BoardActor, BoardWork } from './board-work';

type Tx = Prisma.TransactionClient;

/** The card kind a proposal becomes, or `null` while the project has none (S-24 for `task`). */
const cardKindOf = (kind: CardProposalKind): BoardCardKind | null =>
  (BOARD_CARD_KINDS as readonly string[]).includes(kind)
    ? (kind as BoardCardKind)
    : null;

/**
 * C-506 (ADR-0126): what the person decides on a finished analysis card.
 * Create selected turns ticked proposals into cards linked back to the
 * analysis card; Complete without cards dismisses them all. Either way the
 * analysis card moves to Completed — it has no pull request to merge — in the
 * same transaction, under the card's lock, so a repeat finds it decided.
 */
@Injectable()
export class BoardProposals {
  constructor(
    private readonly work: BoardWork,
    private readonly planCards: BoardPlanCards,
    private readonly audit: AuditService,
    private readonly board: BoardService,
  ) {}

  async create(
    projectId: string,
    number: number,
    request: CreateCardProposalsRequest,
    actor: BoardActor,
  ): Promise<CreateCardProposalsResponse> {
    const project = await this.work.project(projectId);
    const card = await this.work.card(projectId, number);
    this.assertAnalysis(card);
    const positions = [...new Set(request.positions)].sort((a, b) => a - b);
    let made: BoardCard[] = [];
    const dropped: [number, number][] = [];

    // A person's move: the rule refuses an automatic one into Completed.
    await this.work.move(
      project,
      card,
      {
        to: 'completed',
        index: 0,
        source: 'person',
        within: async (tx, fresh) => {
          const open = await this.assertOpen(tx, fresh, request.roundId);
          const chosen = positions.map((position) => {
            const found = open.find((p) => p.position === position);
            if (!found) {
              throw boardError(
                409,
                BOARD_ERROR.proposalsDecided,
                `Proposal ${position} is not pending in this round`,
              );
            }
            return found;
          });
          const drafts: PlanCardDraft[] = chosen.map((p) => {
            const kind = cardKindOf(p.kind);
            if (kind === null) {
              throw boardError(
                422,
                BOARD_ERROR.kindUnavailable,
                `This project has no ${p.kind} card kind yet`,
              );
            }
            return {
              title: p.title,
              body: p.body,
              kind,
              originCardId: fresh.id,
              labels: p.labels,
            };
          });
          const links: [number, number][] = [];
          for (const [index, p] of chosen.entries()) {
            for (const dependsOn of p.dependsOn) {
              const target = chosen.findIndex((c) => c.position === dependsOn);
              if (target === -1) dropped.push([p.position, dependsOn]);
              else links.push([index, target]);
            }
          }
          made = await this.planCards.create(tx, {
            projectId,
            authorId: actor.userId,
            column: request.column,
            drafts,
            links,
          });
          const now = new Date();
          for (const [index, p] of chosen.entries()) {
            await tx.boardCardProposal.update({
              where: { id: p.id },
              data: {
                status: 'created',
                createdCardId: made[index].id,
                decidedById: actor.userId,
                decidedAt: now,
              },
            });
          }
          await this.dismissPending(tx, fresh.id, actor, now);
        },
      },
      actor,
    );

    await this.audit.record({
      ...actor.ctx,
      action: 'card.proposals_created',
      target: { type: 'board_card', id: card.id },
      projectId,
      after: { number: card.number, created: made.map((c) => c.number) },
      result: 'ok',
    });
    await this.planCards.announce(made, actor, { column: request.column });
    return {
      created: made.map((c) => ({ number: c.number, title: c.title })),
      droppedLinks: dropped,
      card: await this.board.detail(projectId, number, actor.role),
    };
  }

  async dismiss(
    projectId: string,
    number: number,
    actor: BoardActor,
  ): Promise<void> {
    const project = await this.work.project(projectId);
    const card = await this.work.card(projectId, number);
    this.assertAnalysis(card);
    let dismissed = 0;
    await this.work.move(
      project,
      card,
      {
        to: 'completed',
        index: 0,
        source: 'person',
        within: async (tx, fresh) => {
          this.assertFinished(fresh);
          dismissed = await this.dismissPending(
            tx,
            fresh.id,
            actor,
            new Date(),
          );
        },
      },
      actor,
    );
    await this.audit.record({
      ...actor.ctx,
      action: 'card.proposals_dismissed',
      target: { type: 'board_card', id: card.id },
      projectId,
      after: { number: card.number, dismissed },
      result: 'ok',
    });
  }

  private assertAnalysis(card: Pick<BoardCard, 'kind'>): void {
    if (card.kind !== 'analysis') {
      throw boardError(
        409,
        BOARD_ERROR.notAnalysis,
        'Only an analysis card has proposals',
      );
    }
  }

  private assertFinished(card: CardWithRounds): void {
    this.assertAnalysis(card);
    if (card.column !== 'finished') {
      throw boardError(
        409,
        BOARD_ERROR.wrongColumn,
        'The analysis is not in Finished: its proposals are decided or still being made',
      );
    }
  }

  /** The `pending` proposals of the round the person saw, once the card is Finished. */
  private async assertOpen(
    tx: Tx,
    card: CardWithRounds,
    roundId: string,
  ): Promise<BoardCardProposal[]> {
    this.assertFinished(card);
    if (card.rounds[0]?.id !== roundId) {
      throw boardError(
        409,
        BOARD_ERROR.proposalsStale,
        'The analysis has a newer round: reload its proposals',
      );
    }
    return tx.boardCardProposal.findMany({
      where: { cardId: card.id, roundId, status: 'pending' },
      orderBy: { position: 'asc' },
    });
  }

  private async dismissPending(
    tx: Tx,
    cardId: string,
    actor: BoardActor,
    now: Date,
  ): Promise<number> {
    const { count } = await tx.boardCardProposal.updateMany({
      where: { cardId, status: 'pending' },
      data: { status: 'dismissed', decidedById: actor.userId, decidedAt: now },
    });
    return count;
  }
}
