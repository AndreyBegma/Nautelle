import { cardLabel } from '@nautelle/shared';
import type { PrismaService } from '../database/prisma.service';
import type { CardFace, CardFacts, CardTaskFact } from './board-mapper';

/** C-509: a person as a task shows them — their name, else their email. */
export const personName = (user: {
  name: string | null;
  email: string;
}): string => user.name ?? user.email;

/**
 * C-509 (ADR-0127): what each task's face shows — its assignee, how much of
 * its checklist is ticked and the card it was raised for — in three queries
 * for every task of the read. Absent when the read holds no task.
 */
export const taskFactsFor = async (
  prisma: PrismaService,
  cards: readonly Pick<
    CardFace,
    'id' | 'kind' | 'assigneeId' | 'raisedForCardId'
  >[],
): Promise<Pick<CardFacts, 'tasks'>> => {
  const tasks = cards.filter((c) => c.kind === 'task');
  if (tasks.length === 0) return {};
  const assigneeIds = [
    ...new Set(
      tasks.flatMap((t) => (t.assigneeId === null ? [] : [t.assigneeId])),
    ),
  ];
  const raisedForIds = [
    ...new Set(
      tasks.flatMap((t) =>
        t.raisedForCardId === null ? [] : [t.raisedForCardId],
      ),
    ),
  ];
  const [users, counts, ticked, raisedFor] = await Promise.all([
    assigneeIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, email: true },
        }),
    prisma.boardCardChecklistItem.groupBy({
      by: ['cardId'],
      where: { cardId: { in: tasks.map((t) => t.id) } },
      _count: { _all: true },
    }),
    prisma.boardCardChecklistItem.groupBy({
      by: ['cardId'],
      where: {
        cardId: { in: tasks.map((t) => t.id) },
        doneAt: { not: null },
      },
      _count: { _all: true },
    }),
    raisedForIds.length === 0
      ? Promise.resolve([])
      : prisma.boardCard.findMany({
          where: { id: { in: raisedForIds } },
          select: { id: true, number: true, column: true },
        }),
  ]);
  const userOf = new Map(users.map((u) => [u.id, u]));
  const totalOf = new Map(counts.map((c) => [c.cardId, c._count._all]));
  const doneOf = new Map(ticked.map((c) => [c.cardId, c._count._all]));
  const cardOf = new Map(raisedFor.map((c) => [c.id, c]));
  const facts = new Map<string, CardTaskFact>();
  for (const task of tasks) {
    const user =
      task.assigneeId === null ? undefined : userOf.get(task.assigneeId);
    const origin =
      task.raisedForCardId === null
        ? undefined
        : cardOf.get(task.raisedForCardId);
    facts.set(task.id, {
      assignee: user ? { id: user.id, name: personName(user) } : null,
      checklist: {
        done: doneOf.get(task.id) ?? 0,
        total: totalOf.get(task.id) ?? 0,
      },
      raisedFor: origin
        ? {
            number: origin.number,
            label: cardLabel(origin.number),
            column: origin.column,
          }
        : null,
    });
  }
  return { tasks: facts };
};
