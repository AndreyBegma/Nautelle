import {
  BOARD_ERROR,
  type CardLabelAutoSource,
  type CardLabelView,
  LABEL_RULES_PER_PROJECT_MAX,
  LABELS_CHANGED_EVENT,
  LABELS_PER_CARD_MAX,
  LABELS_PER_PROJECT_MAX,
  type LabelPathRuleView,
  labelPatternProblem,
  type ProjectLabelsResponse,
  type ProjectLabelView,
} from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';
import {
  type CardLabelSource,
  Prisma,
  type ProjectLabel,
  type ProjectLabelPathRule,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { LiveService } from '../live/live.service';
import { boardError, cardNotFound } from './board-error';
import { cardLabelsOf } from './board-label-facts';
import { type BoardActor, BoardWork } from './board-work';

/** What a label suggester is told about a new card (C-500 plugs into it). */
export interface CardLabelSuggestion {
  cardId: string;
  projectId: string;
  title: string;
  body: string;
}

/** C-500: suggests a new card's labels and writes them through `applyAuto`. */
export interface CardLabelSuggester {
  suggest(card: CardLabelSuggestion): Promise<void>;
}

/**
 * C-497: holds the model's label suggester, as `FleetCardEditsRef` holds the
 * fleet's port. The module that suggests sets it at startup; without it a new
 * card gets no suggestion.
 */
@Injectable()
export class CardLabelSuggestRef {
  private suggester: CardLabelSuggester | null = null;

  set(suggester: CardLabelSuggester | null): void {
    this.suggester = suggester;
  }

  get(): CardLabelSuggester | null {
    return this.suggester;
  }
}

type Tx = Prisma.TransactionClient;

const LABEL_ORDER = [{ position: 'asc' }, { createdAt: 'asc' }] as const;

/** The sources a write of `source` may replace (D5). */
const REPLACES: Record<CardLabelAutoSource, CardLabelSource[]> = {
  paths: ['model', 'paths'],
  model: ['model'],
};

export const projectLabelView = (row: ProjectLabel): ProjectLabelView => ({
  id: row.id,
  name: row.name,
  hue: row.hue,
  position: row.position,
  combines: [...row.combines],
});

export const labelRuleView = (
  row: ProjectLabelPathRule,
): LabelPathRuleView => ({
  id: row.id,
  pattern: row.pattern,
  labelId: row.labelId,
  position: row.position,
});

/** What the audit log keeps of a label. */
const audited = (row: ProjectLabel) => ({
  id: row.id,
  name: row.name,
  hue: row.hue,
  position: row.position,
  combines: row.combines,
});

const isNameConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

const nameTaken = (name: string) =>
  boardError(
    409,
    BOARD_ERROR.labelNameTaken,
    `The project already has a label named ${name}`,
  );

const labelNotFound = () =>
  boardError(404, BOARD_ERROR.notFound, 'Label not found');

/**
 * C-497 (ADR-0125): a project's card labels, their path rules, and the labels
 * of its cards. A project admin edits the labels and rules; an operator sets a
 * card's labels, which are the person's truth. Automation writes only through
 * `applyAuto`, which never writes or deletes a `person` row, so a label a
 * person set stays and one a person removed stays off.
 */
@Injectable()
export class BoardLabels {
  private readonly logger = new Logger(BoardLabels.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly work: BoardWork,
    private readonly live: LiveService,
    private readonly suggestRef: CardLabelSuggestRef,
  ) {}

  async view(projectId: string): Promise<ProjectLabelsResponse> {
    const [labels, rules, settings, counts] = await Promise.all([
      this.labels(projectId),
      this.prisma.projectLabelPathRule.findMany({
        where: { projectId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.boardSettings.findUnique({
        where: { projectId },
        select: { labelSuggest: true, labelPaths: true },
      }),
      this.prisma.boardCardLabel.groupBy({
        by: ['labelId'],
        where: { removed: false, label: { projectId } },
        _count: { _all: true },
      }),
    ]);
    return {
      labels: labels.map(projectLabelView),
      rules: rules.map(labelRuleView),
      cardCounts: Object.fromEntries(
        counts.map((row) => [row.labelId, row._count._all]),
      ),
      suggest: settings?.labelSuggest ?? true,
      paths: settings?.labelPaths ?? true,
    };
  }

  /** Appended last; at most `LABELS_PER_PROJECT_MAX` per project. */
  async create(
    projectId: string,
    input: { name: string; hue: number },
    ctx: AuditContext,
  ): Promise<ProjectLabelView> {
    let row: ProjectLabel;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        await this.lockLabels(tx, projectId);
        const count = await tx.projectLabel.count({ where: { projectId } });
        if (count >= LABELS_PER_PROJECT_MAX) {
          throw boardError(
            422,
            BOARD_ERROR.labelLimit,
            `A project has at most ${LABELS_PER_PROJECT_MAX} labels`,
          );
        }
        return tx.projectLabel.create({
          data: {
            projectId,
            name: input.name,
            hue: input.hue,
            position: count,
          },
        });
      });
    } catch (error) {
      if (isNameConflict(error)) throw nameTaken(input.name);
      throw error;
    }
    await this.record(
      ctx,
      'label.created',
      projectId,
      row.id,
      {},
      {
        label: audited(row),
      },
    );
    this.announce(projectId);
    return projectLabelView(row);
  }

  /**
   * Only the fields given change. `position` moves the label to that index
   * (clamped to the end); `combines` must name other labels of the project.
   */
  async update(
    projectId: string,
    labelId: string,
    input: {
      name?: string;
      hue?: number;
      position?: number;
      combines?: string[];
    },
    ctx: AuditContext,
  ): Promise<ProjectLabelView> {
    let before: ProjectLabel;
    let row: ProjectLabel;
    try {
      [before, row] = await this.prisma.$transaction(async (tx) => {
        await this.lockLabels(tx, projectId);
        const labels = await this.labels(projectId, tx);
        const found = labels.find((l) => l.id === labelId);
        if (!found) throw labelNotFound();
        let combines: string[] | undefined;
        if (input.combines !== undefined) {
          const wanted = new Set(input.combines);
          if (wanted.has(labelId)) {
            throw boardError(
              422,
              BOARD_ERROR.labelUnknown,
              'A label does not combine itself',
            );
          }
          const known = new Set(labels.map((l) => l.id));
          if ([...wanted].some((id) => !known.has(id))) {
            throw this.unknown();
          }
          combines = labels.filter((l) => wanted.has(l.id)).map((l) => l.id);
        }
        if (input.position !== undefined && input.position !== found.position) {
          const order = labels.filter((l) => l.id !== labelId);
          order.splice(Math.min(input.position, order.length), 0, found);
          await this.renumber(
            tx,
            order.map((l) => l.id),
            labels,
          );
        }
        const updated = await tx.projectLabel.update({
          where: { id: labelId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.hue !== undefined ? { hue: input.hue } : {}),
            ...(combines !== undefined ? { combines } : {}),
          },
        });
        return [found, updated] as const;
      });
    } catch (error) {
      if (isNameConflict(error) && input.name !== undefined) {
        throw nameTaken(input.name);
      }
      throw error;
    }
    await this.record(
      ctx,
      'label.updated',
      projectId,
      row.id,
      { label: audited(before) },
      { label: audited(row) },
    );
    this.announce(projectId);
    if (input.name !== undefined || input.hue !== undefined) {
      await this.publishCardsOf(projectId, [labelId]);
    }
    return projectLabelView(row);
  }

  /** Removes the label from every card, every rule and every other label's `combines`. */
  async remove(
    projectId: string,
    labelId: string,
    ctx: AuditContext,
  ): Promise<void> {
    const { label, cardIds } = await this.prisma.$transaction(async (tx) => {
      await this.lockLabels(tx, projectId);
      const labels = await this.labels(projectId, tx);
      const found = labels.find((l) => l.id === labelId);
      if (!found) throw labelNotFound();
      const shown = await tx.boardCardLabel.findMany({
        where: { labelId, removed: false },
        select: { cardId: true },
      });
      // The card rows and the rules go with the label (cascade).
      await tx.projectLabel.delete({ where: { id: labelId } });
      for (const other of labels) {
        if (other.combines.includes(labelId)) {
          await tx.projectLabel.update({
            where: { id: other.id },
            data: { combines: other.combines.filter((id) => id !== labelId) },
          });
        }
      }
      const rest = labels.filter((l) => l.id !== labelId);
      await this.renumber(
        tx,
        rest.map((l) => l.id),
        rest,
      );
      const rules = await tx.projectLabelPathRule.findMany({
        where: { projectId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, position: true },
      });
      for (const [position, rule] of rules.entries()) {
        if (rule.position !== position) {
          await tx.projectLabelPathRule.update({
            where: { id: rule.id },
            data: { position },
          });
        }
      }
      return { label: found, cardIds: shown.map((r) => r.cardId) };
    });
    await this.record(
      ctx,
      'label.deleted',
      projectId,
      labelId,
      { label: audited(label), cards: cardIds.length },
      {},
    );
    this.announce(projectId);
    for (const cardId of cardIds) this.work.publish(projectId, cardId);
  }

  /** Replaces the project's ordered path rules. */
  async replaceRules(
    projectId: string,
    rules: readonly { pattern: string; labelId: string }[],
    ctx: AuditContext,
  ): Promise<LabelPathRuleView[]> {
    if (rules.length > LABEL_RULES_PER_PROJECT_MAX) {
      throw boardError(
        422,
        BOARD_ERROR.labelLimit,
        `A project has at most ${LABEL_RULES_PER_PROJECT_MAX} path rules`,
      );
    }
    for (const rule of rules) {
      const problem = labelPatternProblem(rule.pattern);
      if (problem !== null) {
        throw boardError(
          422,
          BOARD_ERROR.patternInvalid,
          `${problem}: ${rule.pattern}`,
        );
      }
    }
    const { before, after } = await this.prisma.$transaction(async (tx) => {
      await this.lockLabels(tx, projectId);
      await this.assertLabels(
        tx,
        projectId,
        rules.map((r) => r.labelId),
      );
      const previous = await tx.projectLabelPathRule.findMany({
        where: { projectId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      await tx.projectLabelPathRule.deleteMany({ where: { projectId } });
      const created = await tx.projectLabelPathRule.createManyAndReturn({
        data: rules.map((rule, position) => ({
          projectId,
          labelId: rule.labelId,
          pattern: rule.pattern,
          position,
        })),
      });
      return {
        before: previous,
        after: created.sort((a, b) => a.position - b.position),
      };
    });
    const brief = (r: ProjectLabelPathRule) => ({
      pattern: r.pattern,
      labelId: r.labelId,
    });
    await this.record(
      ctx,
      'label.rules_replaced',
      projectId,
      projectId,
      { rules: before.map(brief) },
      { rules: after.map(brief) },
      'project',
    );
    this.announce(projectId);
    return after.map(labelRuleView);
  }

  /**
   * `PUT …/cards/:number/labels`: the person's truth. Each listed label
   * becomes a `person` row; each label the card shows and the list leaves
   * out becomes a `person` removal, which automation never adds back.
   */
  async setCard(
    projectId: string,
    number: number,
    labelIds: readonly string[],
    actor: BoardActor,
  ): Promise<CardLabelView[]> {
    const card = await this.prisma.boardCard.findUnique({
      where: { projectId_number: { projectId, number } },
      select: { id: true },
    });
    if (!card) throw cardNotFound();
    const wanted = [...new Set(labelIds)];
    this.assertCardCap(wanted.length);
    const { before, after } = await this.prisma.$transaction(async (tx) => {
      await this.lockCard(tx, card.id);
      await this.assertLabels(tx, projectId, wanted);
      const before = (await cardLabelsOf(tx, [card.id])).get(card.id) ?? [];
      const listed = new Set(wanted);
      const dropped = before.filter((l) => !listed.has(l.id)).map((l) => l.id);
      for (const labelId of wanted) {
        await tx.boardCardLabel.upsert({
          where: { cardId_labelId: { cardId: card.id, labelId } },
          create: {
            cardId: card.id,
            labelId,
            source: 'person',
            setById: actor.userId,
          },
          update: { source: 'person', removed: false, setById: actor.userId },
        });
      }
      if (dropped.length > 0) {
        await tx.boardCardLabel.updateMany({
          where: { cardId: card.id, labelId: { in: dropped } },
          data: { source: 'person', removed: true, setById: actor.userId },
        });
      }
      const after = (await cardLabelsOf(tx, [card.id])).get(card.id) ?? [];
      return { before, after };
    });
    await this.audit.record({
      ...actor.ctx,
      action: 'card.labels_changed',
      target: { type: 'board_card', id: card.id },
      projectId,
      before: { number, labels: before.map((l) => l.name) },
      after: { number, labels: after.map((l) => l.name) },
      result: 'ok',
    });
    this.work.publish(projectId, card.id);
    return after;
  }

  /**
   * `labelIds` of a card being created, checked before the card exists:
   * labels of the project, at most `LABELS_PER_CARD_MAX`.
   */
  async assertForCreate(
    projectId: string,
    labelIds: readonly string[],
  ): Promise<void> {
    this.assertCardCap(new Set(labelIds).size);
    await this.assertLabels(this.prisma, projectId, labelIds);
  }

  /** Writes a new card's `labelIds` as the person's, inside its create. */
  async writeOnCreate(
    tx: Tx,
    cardId: string,
    labelIds: readonly string[],
    userId: string | null,
  ): Promise<void> {
    const ids = [...new Set(labelIds)];
    if (ids.length === 0) return;
    await tx.boardCardLabel.createMany({
      data: ids.map((labelId) => ({
        cardId,
        labelId,
        source: 'person' as const,
        setById: userId,
      })),
    });
  }

  /**
   * After a card's create commits: asks the registered suggester for its
   * labels, without waiting, when the project's `labelSuggest` is on and the
   * person gave none. With no suggester nothing happens.
   */
  async afterCreate(
    card: CardLabelSuggestion,
    personLabels: boolean,
  ): Promise<void> {
    const suggester = this.suggestRef.get();
    if (personLabels || suggester === null) return;
    const settings = await this.prisma.boardSettings.findUnique({
      where: { projectId: card.projectId },
      select: { labelSuggest: true },
    });
    if (!(settings?.labelSuggest ?? true)) return;
    void suggester.suggest(card).catch((error: unknown) => {
      this.logger.warn(
        `labels of card ${card.cardId} not suggested: ${(error as Error).message}`,
      );
    });
  }

  /**
   * The one way automation writes labels (D4, D5). In one transaction it
   * never writes or deletes a `person` row, so a label a person set or
   * removed stays as they left it. A `model` write is skipped once the card
   * has `paths` rows; a `paths` write replaces the card's `model` and other
   * `paths` rows, a `model` write its other `model` rows. An empty set
   * changes nothing; ids of another project are ignored; the card keeps at
   * most `LABELS_PER_CARD_MAX` labels. The card is published when anything
   * changed. Returns whether anything did.
   */
  async applyAuto(
    cardId: string,
    source: CardLabelAutoSource,
    labelIds: readonly string[],
  ): Promise<boolean> {
    if (labelIds.length === 0) return false;
    const result = await this.prisma.$transaction(async (tx) => {
      const card = await tx.boardCard.findUnique({
        where: { id: cardId },
        select: { projectId: true },
      });
      if (!card) return null;
      await this.lockCard(tx, cardId);
      const rows = await tx.boardCardLabel.findMany({
        where: { cardId },
        select: { labelId: true, source: true, removed: true },
      });
      if (source === 'model' && rows.some((r) => r.source === 'paths')) {
        return null;
      }
      const ofProject = new Set(
        (
          await tx.projectLabel.findMany({
            where: { projectId: card.projectId, id: { in: [...labelIds] } },
            select: { id: true },
          })
        ).map((l) => l.id),
      );
      // Nothing of this project to say: the set counts as empty.
      if (ofProject.size === 0) return null;
      const person = rows.filter((r) => r.source === 'person');
      const personIds = new Set(person.map((r) => r.labelId));
      const room =
        LABELS_PER_CARD_MAX - person.filter((r) => !r.removed).length;
      const wanted = [...new Set(labelIds)]
        .filter((id) => ofProject.has(id) && !personIds.has(id))
        .slice(0, Math.max(room, 0));
      const replaceable = REPLACES[source];
      const keep = new Set(wanted);
      const stale = rows.filter(
        (r) => replaceable.includes(r.source) && !keep.has(r.labelId),
      );
      const current = new Map(
        rows
          .filter((r) => r.source !== 'person')
          .map((r) => [r.labelId, r.source]),
      );
      const fresh = wanted.filter((id) => !current.has(id));
      const resourced = wanted.filter(
        (id) => current.has(id) && current.get(id) !== source,
      );
      let changed = false;
      if (stale.length > 0) {
        const { count } = await tx.boardCardLabel.deleteMany({
          where: {
            cardId,
            labelId: { in: stale.map((r) => r.labelId) },
            source: { in: replaceable },
          },
        });
        changed ||= count > 0;
      }
      if (resourced.length > 0) {
        const { count } = await tx.boardCardLabel.updateMany({
          where: {
            cardId,
            labelId: { in: resourced },
            source: { not: 'person' },
          },
          data: { source },
        });
        changed ||= count > 0;
      }
      if (fresh.length > 0) {
        const { count } = await tx.boardCardLabel.createMany({
          data: fresh.map((labelId) => ({ cardId, labelId, source })),
          skipDuplicates: true,
        });
        changed ||= count > 0;
      }
      return changed ? card.projectId : null;
    });
    if (result === null) return false;
    this.work.publish(result, cardId);
    return true;
  }

  private labels(projectId: string, tx: Tx = this.prisma) {
    return tx.projectLabel.findMany({
      where: { projectId },
      orderBy: [...LABEL_ORDER],
    });
  }

  /** Rewrites `position` to the index in `order`, only where it moved. */
  private async renumber(
    tx: Tx,
    order: readonly string[],
    labels: readonly ProjectLabel[],
  ): Promise<void> {
    const was = new Map(labels.map((l) => [l.id, l.position]));
    for (const [position, id] of order.entries()) {
      if (was.get(id) !== position) {
        await tx.projectLabel.update({ where: { id }, data: { position } });
      }
    }
  }

  /** Every id must be a label of the project, else `label_unknown`. */
  private async assertLabels(
    tx: Tx,
    projectId: string,
    labelIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(labelIds)];
    if (ids.length === 0) return;
    const found = await tx.projectLabel.count({
      where: { projectId, id: { in: ids } },
    });
    if (found !== ids.length) throw this.unknown();
  }

  private assertCardCap(count: number): void {
    if (count > LABELS_PER_CARD_MAX) {
      throw boardError(
        422,
        BOARD_ERROR.labelLimit,
        `A card has at most ${LABELS_PER_CARD_MAX} labels`,
      );
    }
  }

  private unknown() {
    return boardError(
      422,
      BOARD_ERROR.labelUnknown,
      'A label id is no label of this project',
    );
  }

  /** Serializes the label writes of one project: counts, positions, names. */
  private async lockLabels(tx: Tx, projectId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`labels:${projectId}`}))`;
  }

  /** Serializes the label writes of one card: a person's and automation's. */
  private async lockCard(tx: Tx, cardId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`card-labels:${cardId}`}))`;
  }

  /** A card whose face shows one of `labelIds` changes with it. */
  private async publishCardsOf(
    projectId: string,
    labelIds: readonly string[],
  ): Promise<void> {
    const rows = await this.prisma.boardCardLabel.findMany({
      where: { labelId: { in: [...labelIds] }, removed: false },
      select: { cardId: true },
    });
    for (const { cardId } of rows) this.work.publish(projectId, cardId);
  }

  /** `labels.changed`: the project's labels, rules or label flags changed. */
  announce(projectId: string): void {
    try {
      this.live.publish(`project:${projectId}`, LABELS_CHANGED_EVENT, {
        projectId,
      });
    } catch (error) {
      this.logger.warn(
        `${LABELS_CHANGED_EVENT} ${projectId} not published: ${(error as Error).message}`,
      );
    }
  }

  private record(
    ctx: AuditContext,
    action:
      | 'label.created'
      | 'label.updated'
      | 'label.deleted'
      | 'label.rules_replaced',
    projectId: string,
    targetId: string,
    before: object,
    after: object,
    targetType = 'project_label',
  ): Promise<void> {
    return this.audit.record({
      ...ctx,
      action,
      target: { type: targetType, id: targetId },
      projectId,
      before,
      after,
      result: 'ok',
    });
  }
}
