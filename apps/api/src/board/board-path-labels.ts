import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { labelsOfPaths } from './board-label-paths';
import { BoardLabels } from './board-labels.service';
import { type PathLabeller, PathLabelsRef } from './path-labels-ref';

/**
 * C-501: once a card's pull request exists, the files it changes label the
 * card by the project's path rules, through `BoardLabels.applyAuto`: the
 * model's guesses are replaced, a person's labels never. No paths (an older
 * runner), no matching rule or the `labelPaths` switch off: nothing changes.
 */
@Injectable()
export class BoardPathLabels implements OnModuleInit, PathLabeller {
  private readonly logger = new Logger(BoardPathLabels.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly labels: BoardLabels,
    private readonly ref: PathLabelsRef,
  ) {}

  onModuleInit(): void {
    this.ref.set(this);
  }

  /** Never throws: a label that cannot be written must not fail a push. */
  async refine(
    projectId: string,
    cardId: string,
    changedPaths: readonly string[] | undefined,
  ): Promise<void> {
    if (changedPaths === undefined || changedPaths.length === 0) return;
    try {
      const settings = await this.prisma.boardSettings.findUnique({
        where: { projectId },
        select: { labelPaths: true },
      });
      if (!(settings?.labelPaths ?? true)) return;
      const [rules, labels] = await Promise.all([
        this.prisma.projectLabelPathRule.findMany({
          where: { projectId },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { pattern: true, labelId: true },
        }),
        this.prisma.projectLabel.findMany({
          where: { projectId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, combines: true },
        }),
      ]);
      await this.labels.applyAuto(
        cardId,
        'paths',
        labelsOfPaths(changedPaths, rules, labels),
      );
    } catch (error) {
      this.logger.warn(
        `labels of card ${cardId} not refined from its paths: ${(error as Error).message}`,
      );
    }
  }
}
