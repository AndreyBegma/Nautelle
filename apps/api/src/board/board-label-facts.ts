import type { CardLabelView } from '@nautelle/shared';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service';
import type { CardFacts, CardWithRounds } from './board-mapper';

type LabelReader = PrismaService | Prisma.TransactionClient;

/**
 * C-497: the labels each card shows — one query for every card, rows a
 * person removed left out, in label position order.
 */
export const cardLabelsOf = async (
  prisma: LabelReader,
  cardIds: readonly string[],
): Promise<Map<string, CardLabelView[]>> => {
  const labels = new Map<string, CardLabelView[]>();
  if (cardIds.length === 0) return labels;
  const rows = await prisma.boardCardLabel.findMany({
    where: { cardId: { in: [...cardIds] }, removed: false },
    orderBy: [{ label: { position: 'asc' } }, { label: { name: 'asc' } }],
    select: {
      cardId: true,
      source: true,
      label: { select: { id: true, name: true, hue: true } },
    },
  });
  for (const { cardId, source, label } of rows) {
    const list = labels.get(cardId) ?? [];
    list.push({ ...label, source });
    labels.set(cardId, list);
  }
  return labels;
};

/** C-497: the Board's label fact; absent for no cards. */
export const labelFactsFor = async (
  prisma: PrismaService,
  cards: readonly Pick<CardWithRounds, 'id'>[],
): Promise<Pick<CardFacts, 'labels'>> =>
  cards.length === 0
    ? {}
    : {
        labels: await cardLabelsOf(
          prisma,
          cards.map((c) => c.id),
        ),
      };
