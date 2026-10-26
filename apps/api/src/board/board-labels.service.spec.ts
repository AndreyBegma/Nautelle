import type { CardLabelSource } from '@nautelle/shared';
import type { PrismaService } from '../database/prisma.service';
import { BoardLabels, CardLabelSuggestRef } from './board-labels.service';

interface Row {
  cardId: string;
  labelId: string;
  source: CardLabelSource;
  removed: boolean;
}

const CARD = 'card-1';
const PROJECT = 'project-1';
const LABELS = [
  'frontend',
  'backend',
  'fullstack',
  'redesign',
  'infra',
  'docs',
];

const inIds = (filter: { in: string[] } | undefined, id: string) =>
  filter === undefined || filter.in.includes(id);

/** An in-memory Prisma holding one card's label rows. */
const fakePrisma = (initial: Row[]) => {
  let rows = initial.map((row) => ({ ...row }));
  const tx = {
    $executeRaw: async () => 0,
    boardCard: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === CARD ? { projectId: PROJECT } : null,
    },
    projectLabel: {
      findMany: async ({
        where,
      }: {
        where: { projectId: string; id: { in: string[] } };
      }) =>
        where.projectId === PROJECT
          ? LABELS.filter((id) => where.id.in.includes(id)).map((id) => ({
              id,
            }))
          : [],
    },
    boardCardLabel: {
      findMany: async ({ where }: { where: { cardId: string } }) =>
        rows.filter((r) => r.cardId === where.cardId).map((r) => ({ ...r })),
      deleteMany: async ({
        where,
      }: {
        where: {
          cardId: string;
          labelId: { in: string[] };
          source: { in: CardLabelSource[] };
        };
      }) => {
        const before = rows.length;
        rows = rows.filter(
          (r) =>
            !(
              r.cardId === where.cardId &&
              inIds(where.labelId, r.labelId) &&
              where.source.in.includes(r.source)
            ),
        );
        return { count: before - rows.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          cardId: string;
          labelId: { in: string[] };
          source: { not: CardLabelSource };
        };
        data: { source: CardLabelSource };
      }) => {
        let count = 0;
        for (const r of rows) {
          if (
            r.cardId === where.cardId &&
            inIds(where.labelId, r.labelId) &&
            r.source !== where.source.not
          ) {
            r.source = data.source;
            count += 1;
          }
        }
        return { count };
      },
      createMany: async ({
        data,
      }: {
        data: { cardId: string; labelId: string; source: CardLabelSource }[];
      }) => {
        let count = 0;
        for (const d of data) {
          if (
            rows.some((r) => r.cardId === d.cardId && r.labelId === d.labelId)
          )
            continue;
          rows.push({ ...d, removed: false });
          count += 1;
        }
        return { count };
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;
  return { prisma, rows: () => rows };
};

const setup = (initial: Row[]) => {
  const { prisma, rows } = fakePrisma(initial);
  const work = { publish: jest.fn() };
  const labels = new BoardLabels(
    prisma,
    {} as never,
    work as never,
    {} as never,
    new CardLabelSuggestRef(),
  );
  const shown = () =>
    rows()
      .filter((r) => !r.removed)
      .map((r) => `${r.labelId}:${r.source}`)
      .sort();
  return { labels, work, rows, shown };
};

const row = (
  labelId: string,
  source: CardLabelSource,
  removed = false,
): Row => ({ cardId: CARD, labelId, source, removed });

describe('BoardLabels.applyAuto (C-497, ADR-0125)', () => {
  it('writes a model suggestion and publishes the card', async () => {
    const { labels, work, shown } = setup([]);

    await expect(
      labels.applyAuto(CARD, 'model', ['frontend', 'docs']),
    ).resolves.toBe(true);

    expect(shown()).toEqual(['docs:model', 'frontend:model']);
    expect(work.publish).toHaveBeenCalledWith(PROJECT, CARD);
  });

  it('never touches a person row', async () => {
    const { labels, rows } = setup([row('frontend', 'person')]);

    await labels.applyAuto(CARD, 'paths', ['backend']);

    expect(rows()).toContainEqual(row('frontend', 'person'));
    await labels.applyAuto(CARD, 'paths', ['frontend']);
    expect(rows()).toContainEqual(row('frontend', 'person'));
    expect(rows().filter((r) => r.labelId === 'frontend')).toHaveLength(1);
  });

  it('never adds back a label a person removed', async () => {
    const { labels, work, rows } = setup([row('backend', 'person', true)]);

    await expect(labels.applyAuto(CARD, 'paths', ['backend'])).resolves.toBe(
      false,
    );
    await labels.applyAuto(CARD, 'model', ['backend']);

    expect(rows()).toEqual([row('backend', 'person', true)]);
    expect(work.publish).not.toHaveBeenCalled();
  });

  it('skips a model suggestion once the card has path labels', async () => {
    const { labels, work, shown } = setup([row('backend', 'paths')]);

    await expect(
      labels.applyAuto(CARD, 'model', ['frontend', 'backend']),
    ).resolves.toBe(false);

    expect(shown()).toEqual(['backend:paths']);
    expect(work.publish).not.toHaveBeenCalled();
  });

  it('replaces the model rows with path evidence', async () => {
    const { labels, shown } = setup([
      row('frontend', 'model'),
      row('redesign', 'model'),
    ]);

    await expect(
      labels.applyAuto(CARD, 'paths', ['frontend', 'infra']),
    ).resolves.toBe(true);

    expect(shown()).toEqual(['frontend:paths', 'infra:paths']);
  });

  it('replaces older path rows with the new set', async () => {
    const { labels, shown } = setup([row('backend', 'paths')]);

    await labels.applyAuto(CARD, 'paths', ['docs']);

    expect(shown()).toEqual(['docs:paths']);
  });

  it('changes nothing for an empty set', async () => {
    const { labels, work, shown } = setup([
      row('frontend', 'model'),
      row('backend', 'paths'),
    ]);

    await expect(labels.applyAuto(CARD, 'paths', [])).resolves.toBe(false);
    await expect(labels.applyAuto(CARD, 'model', [])).resolves.toBe(false);

    expect(shown()).toEqual(['backend:paths', 'frontend:model']);
    expect(work.publish).not.toHaveBeenCalled();
  });

  it('changes nothing when the set is already there', async () => {
    const { labels, work } = setup([row('docs', 'paths')]);

    await expect(labels.applyAuto(CARD, 'paths', ['docs'])).resolves.toBe(
      false,
    );
    expect(work.publish).not.toHaveBeenCalled();
  });

  it('keeps a card at five labels, the person first', async () => {
    const { labels, shown } = setup([
      row('frontend', 'person'),
      row('backend', 'person'),
      row('docs', 'person'),
      row('infra', 'person'),
    ]);

    await labels.applyAuto(CARD, 'paths', ['redesign', 'fullstack']);

    expect(shown()).toHaveLength(5);
    expect(shown()).toContain('redesign:paths');
    expect(shown()).not.toContain('fullstack:paths');
  });

  it('ignores labels of another project and an unknown card', async () => {
    const { labels, shown } = setup([]);

    await expect(labels.applyAuto(CARD, 'model', ['label-of-b'])).resolves.toBe(
      false,
    );
    await expect(
      labels.applyAuto('card-of-nobody', 'model', ['frontend']),
    ).resolves.toBe(false);
    expect(shown()).toEqual([]);
  });
});
