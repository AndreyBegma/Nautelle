import { cardLabel } from '@nautelle/shared';
import type { CardHeadDeltaResult } from '@nautelle/shared/protocol';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SYSTEM_ACTOR } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { BoardCommands, boardOutput } from './board-commands';
import { BoardFailure } from './board-error';
import type { BoardProject } from './board-work';

/** What `isBaseMerge` needs of a card. */
export interface HeadCarryCard {
  id: string;
  number: number;
  /** The branch its PR goes into; `null` is the project base. */
  prBase: string | null;
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * C-457: whether a card's newer PR head only merges the base into an earlier
 * one, cleanly — so what ran on the earlier head (review steps, a demo) still
 * holds. The API cannot read git (ADR-0001): the runner answers
 * `card.headDelta`, once per `(card, from, to)`, and `card_head_carries`
 * keeps the answer. A runner that does not serve the command, or gives no
 * answer, means "not a base merge" and stores nothing, so the pair is asked
 * again later.
 */
@Injectable()
export class BoardHeadCarry {
  private readonly logger = new Logger(BoardHeadCarry.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: BoardCommands,
  ) {}

  async isBaseMerge(
    project: Pick<BoardProject, 'id' | 'runnerId' | 'rootPath' | 'base'>,
    card: HeadCarryCard,
    from: string,
    to: string,
  ): Promise<boolean> {
    if (from === to) return false;
    const stored = await this.prisma.cardHeadCarry.findUnique({
      where: {
        cardId_fromSha_toSha: { cardId: card.id, fromSha: from, toSha: to },
      },
      select: { baseMerge: true },
    });
    if (stored) return stored.baseMerge;
    if (!this.commands.servesHeadDelta(project.runnerId)) return false;

    let output: CardHeadDeltaResult;
    try {
      output = boardOutput(
        'card.headDelta',
        await this.commands.headDelta(
          project.runnerId,
          {
            cardId: card.id,
            projectId: project.id,
            root: project.rootPath,
            from,
            to,
            base: card.prBase ?? project.base,
          },
          { role: 'operator', ctx: { actor: SYSTEM_ACTOR } },
        ),
      );
    } catch (error) {
      if (!(error instanceof BoardFailure)) throw error;
      this.logger.warn(
        `${cardLabel(card.number)}: card.headDelta gave no answer — ${error.message}`,
      );
      return false;
    }
    try {
      await this.prisma.cardHeadCarry.create({
        data: {
          cardId: card.id,
          fromSha: from,
          toSha: to,
          baseMerge: output.baseMerge,
          reason: output.baseMerge ? null : output.reason,
        },
      });
    } catch (error) {
      // A concurrent ask stored the same pair first; its answer is the same.
      if (!isUniqueViolation(error)) throw error;
    }
    return output.baseMerge;
  }
}
