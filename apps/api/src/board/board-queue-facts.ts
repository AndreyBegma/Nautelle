import type { CardQueueView } from '@nautelle/shared';
import type { PrismaService } from '../database/prisma.service';
import type { CardFacts } from './board-mapper';

/** C-398: the To Do cards of one project in the run queue, in To Do order. */
const queueOf = (prisma: PrismaService, projectId: string) =>
  prisma.boardRunQueueCard.findMany({
    where: {
      status: { in: ['queued', 'waiting'] },
      card: { projectId, column: 'todo' },
    },
    orderBy: [{ card: { position: 'asc' } }, { card: { number: 'asc' } }],
    select: {
      cardId: true,
      status: true,
      run: { select: { stack: { select: { number: true } } } },
    },
  });

/**
 * C-398 (ADR-0100): the run queue's chip of each card — its state and its
 * place among the project's queued cards.
 */
export const queueFactsFor = async (
  prisma: PrismaService,
  cards: readonly { id: string; projectId: string; column: string }[],
): Promise<Pick<CardFacts, 'queue'>> => {
  const projects = [
    ...new Set(
      cards.filter((c) => c.column === 'todo').map((c) => c.projectId),
    ),
  ];
  if (projects.length === 0) return {};
  const queue = new Map<string, CardQueueView>();
  for (const entries of await Promise.all(
    projects.map((p) => queueOf(prisma, p)),
  )) {
    let place = 0;
    for (const entry of entries) {
      const queued = entry.status === 'queued';
      if (queued) place += 1;
      queue.set(entry.cardId, {
        state: queued ? 'queued' : 'waiting',
        place: queued ? place : null,
        stack: entry.run?.stack.number ?? null,
      });
    }
  }
  return { queue };
};

/** C-398: the project's To Do cards in the run queue — the Board header's count. */
export const queuedCount = (
  prisma: PrismaService,
  projectId: string,
): Promise<number> =>
  prisma.boardRunQueueCard.count({
    where: {
      status: { in: ['queued', 'waiting'] },
      card: { projectId, column: 'todo' },
    },
  });
