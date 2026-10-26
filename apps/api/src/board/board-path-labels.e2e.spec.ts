import { BoardLabels } from './board-labels.service';
import { writeStarterLabels } from './starter-labels';
import { BoardWorld, HEAD_SHA, ok } from './testing/board-e2e';

const PR_URL = 'https://github.com/acme/widget/pull/77';

/**
 * C-501 (ADR-0125 D7): once a card's pull request exists, the files it changes
 * label the card by the project's path rules — the model's guesses are
 * replaced, a person's labels and removals never.
 */
describe('labels from the pull request’s changed files (e2e, C-501)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    await writeStarterLabels(w.ctx.prisma, w.a);
  });
  afterEach(() => w.work.settled());

  const idOf = async (name: string) => {
    const found = await w.ctx.prisma.projectLabel.findFirst({
      where: { projectId: w.a, name },
    });
    if (!found) throw new Error(`no label ${name}`);
    return found.id;
  };
  const shown = async (number = 1) =>
    (
      await w.ctx.prisma.boardCardLabel.findMany({
        where: { card: { projectId: w.a, number } },
        include: { label: true },
      })
    )
      .map((r) => `${r.label.name}:${r.source}${r.removed ? ':removed' : ''}`)
      .sort();

  const started = async () => {
    await w.createCard();
    expect((await w.runCard(1)).status).toBe(200);
  };
  const pushed = async (extra: Record<string, unknown> = {}) => {
    const card = await w.card(1);
    const round = card.rounds[card.rounds.length - 1];
    await w.deliver('card_run.pushed', {
      cardId: card.id,
      runId: round.runId,
      projectId: card.projectId,
      at: new Date().toISOString(),
      branch: card.branch,
      headSha: HEAD_SHA,
      prNumber: 77,
      prUrl: PR_URL,
      ...extra,
    });
  };
  const auto = async (source: 'model' | 'paths', names: string[]) => {
    const card = await w.card(1);
    await w.ctx.app
      .get(BoardLabels)
      .applyAuto(card.id, source, await Promise.all(names.map((n) => idOf(n))));
  };

  it('replaces the model’s guess with the labels of the changed files', async () => {
    await started();
    await auto('model', ['docs']);
    expect(await shown()).toEqual(['docs:model']);

    await pushed({ changedPaths: ['apps/api/src/a.ts', 'apps/api/src/b.ts'] });
    expect(await shown()).toEqual(['backend:paths']);
  });

  it('reads a change to both apps as fullstack', async () => {
    await started();
    await pushed({ changedPaths: ['apps/api/src/a.ts', 'apps/web/src/a.tsx'] });
    expect(await shown()).toEqual(['fullstack:paths']);
  });

  it('collect reports the paths too', async () => {
    w.handlers['card.collect'] = () =>
      ok({
        prNumber: 77,
        prUrl: PR_URL,
        ahead: 1,
        changedPaths: ['docs/specs/a.md'],
      });
    await started();
    await auto('model', ['frontend']);
    const card = await w.card(1);
    const round = card.rounds[card.rounds.length - 1];
    await w.deliver('card_run.phase_changed', {
      cardId: card.id,
      runId: round.runId,
      projectId: card.projectId,
      at: new Date().toISOString(),
      phase: 'ended',
      exitCode: 0,
    });
    await w.work.settled();
    expect(await shown()).toEqual(['docs:paths']);
  });

  it('keeps a person’s label beside the paths’, and never re-adds one they removed', async () => {
    await started();
    const [frontend, docs] = [await idOf('frontend'), await idOf('docs')];
    // The person sets frontend and docs, then drops docs.
    expect(
      (
        await w.operator.send('put', `${w.path()}/board/cards/1/labels`, {
          labelIds: [frontend, docs],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await w.operator.send('put', `${w.path()}/board/cards/1/labels`, {
          labelIds: [frontend],
        })
      ).status,
    ).toBe(200);

    await pushed({
      changedPaths: ['docs/a.md', 'apps/api/src/a.ts', 'apps/web/src/a.tsx'],
    });
    expect(await shown()).toEqual([
      'docs:person:removed',
      'frontend:person',
      'fullstack:paths',
    ]);
  });

  it('changes nothing without a match, without paths or with the switch off', async () => {
    await started();
    await auto('model', ['docs']);

    await pushed({ changedPaths: ['README.md'] });
    expect(await shown()).toEqual(['docs:model']);
    // An older runner reports no paths.
    await pushed({});
    expect(await shown()).toEqual(['docs:model']);

    await w.ctx.prisma.boardSettings.upsert({
      where: { projectId: w.a },
      update: { labelPaths: false },
      create: { projectId: w.a, labelPaths: false },
    });
    await pushed({ changedPaths: ['apps/api/src/a.ts'] });
    expect(await shown()).toEqual(['docs:model']);
  });

  it('writes nothing for a push without a pull request', async () => {
    await started();
    await auto('model', ['docs']);
    await pushed({
      prNumber: undefined,
      prUrl: undefined,
      changedPaths: ['apps/api/src/a.ts'],
    });
    expect(await shown()).toEqual(['docs:model']);
  });
});
