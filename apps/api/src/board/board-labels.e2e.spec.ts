import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOARD_ERROR,
  type BoardView,
  type CardLabelView,
  LABELS_PER_PROJECT_MAX,
  type ProjectLabelsResponse,
  type ProjectLabelView,
  STARTER_LABEL_RULES,
  STARTER_LABELS,
} from '@nautelle/shared';
import { BoardLabels } from './board-labels.service';
import { writeStarterLabels } from './starter-labels';
import { BoardWorld } from './testing/board-e2e';

/**
 * C-497 (ADR-0125): a project's card labels — the starter set, the admin's
 * label and rule routes, a card's labels set by a person, and the Board's
 * cards showing them from one query.
 */
describe('card labels (e2e, C-497)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(async () => {
    await w.reset();
    await writeStarterLabels(w.ctx.prisma, w.a);
    await writeStarterLabels(w.ctx.prisma, w.b);
  });
  afterEach(() => w.work.settled());

  const view = async (session = w.viewer, projectId = w.a) => {
    const response = await session.get(`${w.path(projectId)}/labels`);
    expect(response.status).toBe(200);
    return response.body as ProjectLabelsResponse;
  };
  const idOf = async (name: string, projectId = w.a) => {
    const found = (await view(w.admin, projectId)).labels.find(
      (l) => l.name === name,
    );
    if (!found) throw new Error(`no label ${name}`);
    return found.id;
  };
  const setCard = (number: number, labelIds: string[], session = w.operator) =>
    session.send('put', `${w.path()}/board/cards/${number}/labels`, {
      labelIds,
    });
  const shown = async (number: number) =>
    (
      await w.ctx.prisma.boardCardLabel.findMany({
        where: { card: { projectId: w.a, number } },
        include: { label: true },
      })
    )
      .map((r) => `${r.label.name}:${r.source}${r.removed ? ':removed' : ''}`)
      .sort();

  it('starts a project with the starter set, its rules and fullstack', async () => {
    const labels = await view();

    expect(labels.suggest).toBe(true);
    expect(labels.paths).toBe(true);
    expect(labels.labels.map((l) => [l.name, l.hue, l.position])).toEqual(
      STARTER_LABELS.map((l, i) => [l.name, l.hue, i]),
    );
    const byId = new Map(labels.labels.map((l) => [l.id, l.name]));
    expect(
      labels.labels
        .find((l) => l.name === 'fullstack')
        ?.combines.map((id) => byId.get(id)),
    ).toEqual(['frontend', 'backend']);
    expect(labels.rules.map((r) => [r.pattern, byId.get(r.labelId)])).toEqual(
      STARTER_LABEL_RULES.map((r) => [r.pattern, r.label]),
    );
  });

  it('backfills the same starter set into existing projects in the migration', async () => {
    const before = await view(w.admin, w.b);
    await w.ctx.prisma.projectLabel.deleteMany({});
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20261231000051_card_labels/migration.sql',
      ),
      'utf8',
    );
    const backfill = sql.slice(sql.indexOf('-- Backfill'));
    for (const statement of backfill.split(/;\s*\n/)) {
      if (statement.replace(/--.*$/gm, '').trim() === '') continue;
      await w.ctx.prisma.$executeRawUnsafe(statement);
    }

    for (const projectId of [w.a, w.b]) {
      const after = await view(w.admin, projectId);
      const names = (labels: ProjectLabelView[], ids: string[]) =>
        ids.map((id) => labels.find((l) => l.id === id)?.name);
      expect(after.labels.map((l) => [l.name, l.hue, l.position])).toEqual(
        before.labels.map((l) => [l.name, l.hue, l.position]),
      );
      expect(after.labels.map((l) => names(after.labels, l.combines))).toEqual(
        before.labels.map((l) => names(before.labels, l.combines)),
      );
      expect(
        after.rules.map((r) => [
          r.pattern,
          r.position,
          names(after.labels, [r.labelId])[0],
        ]),
      ).toEqual(
        before.rules.map((r) => [
          r.pattern,
          r.position,
          names(before.labels, [r.labelId])[0],
        ]),
      );
    }
  });

  it('lets a project admin create, change, reorder and delete labels', async () => {
    const created = await w.admin.send('post', `${w.path()}/labels`, {
      name: 'mobile',
      hue: 4,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'mobile',
      hue: 4,
      position: STARTER_LABELS.length,
      combines: [],
    });
    const id = (created.body as ProjectLabelView).id;

    const changed = await w.admin.send('patch', `${w.path()}/labels/${id}`, {
      name: 'ios',
      hue: 6,
      position: 0,
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'ios', hue: 6, position: 0 });
    expect((await view()).labels.map((l) => l.name)).toEqual([
      'ios',
      ...STARTER_LABELS.map((l) => l.name),
    ]);

    expect(
      (await w.admin.send('delete', `${w.path()}/labels/${id}`)).status,
    ).toBe(204);
    expect((await view()).labels.map((l) => [l.name, l.position])).toEqual(
      STARTER_LABELS.map((l, i) => [l.name, i]),
    );
    expect((await w.audit('label.created')).length).toBe(1);
    expect((await w.audit('label.updated')).length).toBe(1);
    expect((await w.audit('label.deleted')).length).toBe(1);
  });

  it('refuses a taken name, a bad name and a bad hue', async () => {
    const taken = await w.admin.send('post', `${w.path()}/labels`, {
      name: 'docs',
      hue: 1,
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe(BOARD_ERROR.labelNameTaken);
    const renamed = await w.admin.send(
      'patch',
      `${w.path()}/labels/${await idOf('infra')}`,
      { name: 'docs' },
    );
    expect(renamed.status).toBe(409);
    expect(renamed.body.error).toBe(BOARD_ERROR.labelNameTaken);
    for (const body of [
      { name: 'Docs', hue: 1 },
      { name: '-x', hue: 1 },
      { name: 'a'.repeat(33), hue: 1 },
      { name: 'ok', hue: 0 },
      { name: 'ok', hue: 9 },
      { name: 'ok', hue: '#ff0000' },
    ]) {
      expect(
        (await w.admin.send('post', `${w.path()}/labels`, body)).status,
      ).toBe(400);
    }
    // The same name in another project is fine.
    expect(
      (
        await w.admin.send('post', `${w.path(w.b)}/labels`, {
          name: 'mobile',
          hue: 2,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await w.admin.send('post', `${w.path()}/labels`, {
          name: 'mobile',
          hue: 2,
        })
      ).status,
    ).toBe(201);
  });

  it('refuses the 31st label of a project', async () => {
    for (let i = STARTER_LABELS.length; i < LABELS_PER_PROJECT_MAX; i += 1) {
      const response = await w.admin.send('post', `${w.path()}/labels`, {
        name: `extra-${i}`,
        hue: 1,
      });
      expect(response.status).toBe(201);
    }
    const over = await w.admin.send('post', `${w.path()}/labels`, {
      name: 'one-too-many',
      hue: 1,
    });
    expect(over.status).toBe(422);
    expect(over.body.error).toBe(BOARD_ERROR.labelLimit);
  });

  it('keeps label and rule changes to a project admin', async () => {
    const id = await idOf('docs');
    for (const session of [w.operator, w.viewer]) {
      expect(
        (
          await session.send('post', `${w.path()}/labels`, {
            name: 'mobile',
            hue: 1,
          })
        ).status,
      ).toBe(403);
      expect(
        (await session.send('patch', `${w.path()}/labels/${id}`, { hue: 2 }))
          .status,
      ).toBe(403);
      expect(
        (await session.send('delete', `${w.path()}/labels/${id}`)).status,
      ).toBe(403);
      expect(
        (await session.send('put', `${w.path()}/labels/rules`, { rules: [] }))
          .status,
      ).toBe(403);
    }
    // A viewer reads them; a member of B does not see A.
    await view(w.viewer);
    expect(
      [404, 403].includes(
        (await w.operatorOfB.get(`${w.path()}/labels`)).status,
      ),
    ).toBe(true);
    expect(
      [404, 403].includes((await w.outsider.get(`${w.path()}/labels`)).status),
    ).toBe(true);
  });

  it('replaces the path rules and refuses a bad pattern or a foreign label', async () => {
    const docs = await idOf('docs');
    const replaced = await w.admin.send('put', `${w.path()}/labels/rules`, {
      rules: [
        { pattern: 'site/**', labelId: docs },
        { pattern: '**/*.md', labelId: docs },
      ],
    });
    expect(replaced.status).toBe(200);
    expect((await view()).rules.map((r) => [r.pattern, r.position])).toEqual([
      ['site/**', 0],
      ['**/*.md', 1],
    ]);
    expect((await w.audit('label.rules_replaced')).length).toBe(1);

    for (const pattern of ['/abs/**', 'a/../b', 'a**/b', 'x'.repeat(201), '']) {
      const response = await w.admin.send('put', `${w.path()}/labels/rules`, {
        rules: [{ pattern, labelId: docs }],
      });
      expect(response.status).toBe(422);
      expect(response.body.error).toBe(BOARD_ERROR.patternInvalid);
    }
    const foreign = await w.admin.send('put', `${w.path()}/labels/rules`, {
      rules: [{ pattern: 'a/**', labelId: await idOf('docs', w.b) }],
    });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error).toBe(BOARD_ERROR.labelUnknown);
    const many = await w.admin.send('put', `${w.path()}/labels/rules`, {
      rules: Array.from({ length: 51 }, (_, i) => ({
        pattern: `p${i}/**`,
        labelId: docs,
      })),
    });
    expect(many.status).toBe(422);
    expect(many.body.error).toBe(BOARD_ERROR.labelLimit);
    // Nothing changed by the refusals.
    expect((await view()).rules).toHaveLength(2);
  });

  it('refuses combining an unknown or the same label', async () => {
    const fullstack = await idOf('fullstack');
    for (const combines of [[fullstack], [await idOf('docs', w.b)]]) {
      const response = await w.admin.send(
        'patch',
        `${w.path()}/labels/${fullstack}`,
        { combines },
      );
      expect(response.status).toBe(422);
      expect(response.body.error).toBe(BOARD_ERROR.labelUnknown);
    }
    expect(
      (
        await w.admin.send('patch', `${w.path()}/labels/no-such-label`, {
          hue: 2,
        })
      ).status,
    ).toBe(404);
  });

  it("sets a card's labels as the person's, and a removal sticks", async () => {
    const card = await w.createCard();
    const [frontend, backend] = [await idOf('frontend'), await idOf('backend')];

    const set = await setCard(card.number, [backend, frontend]);
    expect(set.status).toBe(200);
    // In label position order, whatever the request's order.
    expect(
      (set.body as CardLabelView[]).map((l) => [l.name, l.source]),
    ).toEqual([
      ['frontend', 'person'],
      ['backend', 'person'],
    ]);

    expect((await setCard(card.number, [backend])).status).toBe(200);
    expect(await shown(card.number)).toEqual([
      'backend:person',
      'frontend:person:removed',
    ]);
    const labels = w.ctx.app.get(BoardLabels);
    await labels.applyAuto(card.id, 'paths', [frontend, backend]);
    expect(await shown(card.number)).toEqual([
      'backend:person',
      'frontend:person:removed',
    ]);
    const audits = await w.audit('card.labels_changed');
    expect(audits.map((a) => a.after)).toEqual([
      { number: card.number, labels: ['frontend', 'backend'] },
      { number: card.number, labels: ['backend'] },
    ]);
  });

  it('counts the cards that show each label, not the ones that removed it', async () => {
    const first = await w.createCard();
    const second = await w.createCard();
    const [frontend, backend] = [await idOf('frontend'), await idOf('backend')];
    expect((await view()).cardCounts).toEqual({});

    await setCard(first.number, [frontend, backend]);
    await setCard(second.number, [backend]);
    expect((await view()).cardCounts).toEqual({ [frontend]: 1, [backend]: 2 });

    // A removal is a row that no card shows.
    await setCard(first.number, [backend]);
    expect((await view()).cardCounts).toEqual({ [backend]: 2 });
  });

  it('refuses a sixth card label, a foreign label and a foreign card', async () => {
    const card = await w.createCard();
    const ids = (await view()).labels.map((l) => l.id);

    const six = await setCard(card.number, ids.slice(0, 6));
    expect(six.status).toBe(422);
    expect(six.body.error).toBe(BOARD_ERROR.labelLimit);
    const foreign = await setCard(card.number, [await idOf('docs', w.b)]);
    expect(foreign.status).toBe(422);
    expect(foreign.body.error).toBe(BOARD_ERROR.labelUnknown);
    expect(await shown(card.number)).toEqual([]);

    // A member of B, and a viewer of A, cannot set labels on A's card.
    expect(
      [404, 403].includes(
        (await setCard(card.number, [ids[0]], w.operatorOfB)).status,
      ),
    ).toBe(true);
    expect((await setCard(card.number, [ids[0]], w.viewer)).status).toBe(403);
    expect((await setCard(9999, [ids[0]])).status).toBe(404);
  });

  it('writes the labels a new card is created with as the person’s', async () => {
    const docs = await idOf('docs');
    const card = await w.createCard({ labelIds: [docs] });
    expect(await shown(card.number)).toEqual(['docs:person']);
    const [created] = await w.audit('card.created');
    expect(created.after).toMatchObject({ labelIds: [docs] });

    const ids = (await view()).labels.map((l) => l.id);
    const six = await w.operator.send('post', `${w.path()}/board/cards`, {
      title: 'Too many',
      labelIds: ids,
    });
    expect(six.status).toBe(422);
    expect(six.body.error).toBe(BOARD_ERROR.labelLimit);
    const foreign = await w.operator.send('post', `${w.path()}/board/cards`, {
      title: 'Foreign',
      labelIds: [await idOf('docs', w.b)],
    });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error).toBe(BOARD_ERROR.labelUnknown);
    expect(
      await w.ctx.prisma.boardCard.count({ where: { projectId: w.a } }),
    ).toBe(1);
  });

  it('removes a deleted label from cards, rules and combinations', async () => {
    const card = await w.createCard();
    const frontend = await idOf('frontend');
    await setCard(card.number, [frontend, await idOf('docs')]);

    expect(
      (await w.admin.send('delete', `${w.path()}/labels/${frontend}`)).status,
    ).toBe(204);

    expect(await shown(card.number)).toEqual(['docs:person']);
    const after = await view();
    expect(after.rules.map((r) => r.pattern)).not.toContain('apps/web/**');
    expect(after.rules.map((r) => r.position)).toEqual(
      after.rules.map((_, i) => i),
    );
    expect(after.labels.find((l) => l.name === 'fullstack')?.combines).toEqual([
      await idOf('backend'),
    ]);
    expect(
      (await w.admin.send('delete', `${w.path()}/labels/${frontend}`)).status,
    ).toBe(404);
  });

  it('shows the Board cards with their labels from one query', async () => {
    const ids = (await view()).labels.map((l) => l.id);
    for (let i = 0; i < 4; i += 1) {
      const card = await w.createCard({ title: `Card ${i}` });
      await setCard(card.number, [ids[i], ids[i + 1]]);
    }
    const reads = jest.spyOn(w.ctx.prisma.boardCardLabel, 'findMany');
    try {
      const board = await w.viewer.get(`${w.path()}/board`);
      expect(board.status).toBe(200);
      const cards =
        (board.body as BoardView).columns.find((c) => c.column === 'todo')
          ?.cards ?? [];
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        expect(card.labels).toHaveLength(2);
        expect(card.labels[0]).toEqual({
          id: expect.any(String),
          name: expect.any(String),
          hue: expect.any(Number),
          source: 'person',
        });
      }
      expect(reads).toHaveBeenCalledTimes(1);
    } finally {
      reads.mockRestore();
    }
  });

  it('turns the label suggestion and path rules off in the board settings', async () => {
    const settings = await w.admin.send('put', `${w.path()}/board-settings`, {
      issueOnRun: false,
      specOnRun: false,
      maxRunning: 2,
      labelSuggest: false,
      labelPaths: false,
    });
    expect(settings.status).toBe(200);
    expect(await view()).toMatchObject({ suggest: false, paths: false });
  });
});
