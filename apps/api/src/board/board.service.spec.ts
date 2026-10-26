import { BOARD_COMPLETED_PAGE_SIZE } from '@nautelle/shared';
import type { PrismaService } from '../database/prisma.service';
import { BoardService } from './board.service';
import { cardFaceOmit, cardFaceRoundSelect } from './board-mapper';

/**
 * A Prisma that answers every read with nothing and records the card reads;
 * those wait for `release`, so the test sees what ran alongside them.
 */
const recordingPrisma = () => {
  const cardReads: unknown[] = [];
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const empty = (method: string) =>
    method.startsWith('findMany') || method === 'groupBy'
      ? []
      : method === 'count'
        ? 0
        : null;
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_, method: string) => async (args: unknown) => {
          if (name === 'boardCard' && method === 'findMany') {
            cardReads.push(args);
            await held;
          }
          return empty(method);
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_, name: string) =>
        name.startsWith('$') ? async () => [] : model(name),
    },
  ) as unknown as PrismaService;
  return { prisma, cardReads, release };
};

const service = (prisma: PrismaService) => {
  const work = {
    project: jest
      .fn()
      .mockResolvedValue({ base: 'develop', defaultBranch: 'main' }),
  };
  const stacks = {
    views: jest.fn().mockResolvedValue([]),
    refsOf: jest.fn().mockResolvedValue(new Map()),
  };
  const none = { counts: async () => new Map(), refsOf: async () => new Map() };
  const board = new BoardService(
    prisma,
    work as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    none as never,
    {} as never,
    {} as never,
    none as never,
    stacks as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { board, work, stacks };
};

describe('BoardService.board (C-364)', () => {
  it('reads only the card-face columns of the cards and their rounds', async () => {
    const { prisma, cardReads, release } = recordingPrisma();
    const { board } = service(prisma);
    release();
    await board.board('p1', undefined, 'operator');

    expect(cardReads).toHaveLength(2);
    for (const read of cardReads) {
      expect(read).toMatchObject({
        omit: cardFaceOmit,
        include: {
          rounds: {
            orderBy: { round: 'desc' },
            select: cardFaceRoundSelect,
          },
        },
      });
    }
    // The prompt snapshot and the long texts stay on the card detail.
    for (const column of [
      'cardBody',
      'cardAttachments',
      'feedback',
      'summary',
      'restartEstimate',
      'error',
    ]) {
      expect(cardFaceRoundSelect).not.toHaveProperty(column);
    }
    expect(cardFaceOmit).toMatchObject({ body: true, evidence: true });
    expect(cardReads[1]).toMatchObject({
      where: { projectId: 'p1', column: 'completed' },
      take: BOARD_COMPLETED_PAGE_SIZE + 1,
    });
  });

  it('starts the project and stacks reads alongside the card reads', async () => {
    const { prisma, cardReads, release } = recordingPrisma();
    const { board, work, stacks } = service(prisma);
    const view = board.board('p1', undefined, 'operator');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cardReads).toHaveLength(2);
    expect(work.project).toHaveBeenCalledWith('p1');
    expect(stacks.views).toHaveBeenCalledWith('p1');
    release();
    await expect(view).resolves.toMatchObject({ projectId: 'p1' });
  });

  it('keeps the Inbox from a viewer (#244 D8)', async () => {
    const { prisma, cardReads, release } = recordingPrisma();
    const { board } = service(prisma);
    release();
    const view = await board.board('p1', undefined, 'viewer');

    expect(cardReads[0]).toMatchObject({
      where: { column: { notIn: ['completed', 'inbox'] } },
    });
    expect(view.columns.map((c) => c.column)).not.toContain('inbox');
  });
});
