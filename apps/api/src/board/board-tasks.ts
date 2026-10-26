import {
  BOARD_ERROR,
  cardLabel,
  mayActOnTask,
  projectRoleAtLeast,
  TASK_CHECKLIST_MAX,
} from '@nautelle/shared';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { BoardCard, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { boardError, cardNotFound } from './board-error';
import type { CardWithRounds } from './board-mapper';
import { type BoardActor, BoardWork } from './board-work';
import type {
  AddTaskChecklistItemDto,
  CreateBoardCardDto,
  UpdateBoardCardDto,
  UpdateTaskChecklistItemDto,
} from './dto';
import { hiddenFrom } from './inbox-access';

type Tx = Prisma.TransactionClient;

/** C-509: the fields only a code card has, refused on a task at update. */
const CODE_FIELDS = [
  'issueOnRun',
  'specOnRun',
  'issueNumber',
  'model',
  'designModel',
  'profileKey',
  'designTemplate',
  'continueAfterDesign',
  'autoCollect',
  'autoRunWhenReady',
] as const satisfies readonly (keyof UpdateBoardCardDto)[];

const taskField = (message: string) =>
  boardError(422, BOARD_ERROR.taskField, message);

const notATask = (card: Pick<BoardCard, 'number'>) =>
  boardError(
    409,
    BOARD_ERROR.notATask,
    `${cardLabel(card.number)} is not a task`,
  );

const itemNotFound = () =>
  boardError(404, BOARD_ERROR.notFound, 'Checklist item not found');

/**
 * C-509 (ADR-0127): a `task` card — work a person does. It owns what only a
 * task has: its assignee, its checklist, Done and Reopen. `BoardService`
 * asks it before it creates or edits a card, so a task never takes a code
 * card's fields and a code card never takes a task's.
 */
@Injectable()
export class BoardTasks {
  constructor(
    private readonly prisma: PrismaService,
    private readonly work: BoardWork,
    private readonly audit: AuditService,
  ) {}

  /**
   * `POST /board/cards`: a task needs its assignee and takes none of a code
   * card's fields; any other kind takes no assignee or checklist. Checked
   * before the card exists.
   */
  async checkCreate(projectId: string, dto: CreateBoardCardDto): Promise<void> {
    if (dto.kind !== 'task') {
      if (dto.assigneeId !== undefined || dto.checklist !== undefined) {
        throw taskField('Only a task has an assignee and a checklist');
      }
      return;
    }
    const code = (['issueOnRun', 'specOnRun', 'issueNumber'] as const).filter(
      (field) => dto[field] !== undefined,
    );
    if (code.length > 0) {
      throw taskField(`A task has no ${code.join(', ')}`);
    }
    // D7: a created card lands in To Do, where a task always has someone.
    if (dto.assigneeId === undefined) {
      throw taskField('A task needs an assignee');
    }
    await this.assertAssignee(projectId, dto.assigneeId);
  }

  /** Writes a new task's checklist, in the order given. */
  async writeChecklist(
    tx: Tx,
    cardId: string,
    texts: readonly string[],
  ): Promise<void> {
    if (texts.length === 0) return;
    await tx.boardCardChecklistItem.createMany({
      data: texts.map((text, i) => ({
        cardId,
        position: i + 1,
        text: text.trim(),
      })),
    });
  }

  /**
   * `PATCH /board/cards/:number`: a task's kind is fixed when it is made (D2)
   * and it takes none of a code card's fields; only a task has an assignee.
   */
  async checkUpdate(
    card: Pick<BoardCard, 'projectId' | 'kind'>,
    dto: UpdateBoardCardDto,
  ): Promise<void> {
    const task = card.kind === 'task';
    if (dto.kind !== undefined && (dto.kind === 'task') !== task) {
      throw taskField(
        task
          ? "A task's kind is fixed: make a new card instead"
          : 'A card becomes no task: make a new task instead',
      );
    }
    if (!task) {
      if (dto.assigneeId !== undefined) {
        throw taskField('Only a task has an assignee');
      }
      return;
    }
    const code = CODE_FIELDS.filter((field) => dto[field] !== undefined);
    if (code.length > 0) throw taskField(`A task has no ${code.join(', ')}`);
    if (dto.assigneeId !== undefined) {
      await this.assertAssignee(card.projectId, dto.assigneeId);
    }
  }

  /**
   * D7: a task is assigned to a member of the project, or to an active
   * admin, who sees every project; anyone else is 422 `assignee_not_member`.
   */
  async assertAssignee(projectId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        memberships: { where: { projectId }, select: { userId: true } },
      },
    });
    const allowed =
      user !== null &&
      user.status === 'active' &&
      (user.role === 'admin' || user.memberships.length > 0);
    if (!allowed) {
      throw boardError(
        422,
        BOARD_ERROR.assigneeNotMember,
        'The assignee must be a member of the project',
      );
    }
  }

  /** `POST …/checklist`: appends an item (operator+, by the route). */
  async addItem(
    projectId: string,
    number: number,
    dto: AddTaskChecklistItemDto,
    actor: BoardActor,
  ): Promise<void> {
    const card = await this.task(projectId, number, actor);
    await this.prisma.$transaction(async (tx) => {
      await this.work.lock(tx, card.id);
      const items = await tx.boardCardChecklistItem.aggregate({
        where: { cardId: card.id },
        _count: { _all: true },
        _max: { position: true },
      });
      if (items._count._all >= TASK_CHECKLIST_MAX) {
        throw taskField(
          `A task holds at most ${TASK_CHECKLIST_MAX} checklist items`,
        );
      }
      await tx.boardCardChecklistItem.create({
        data: {
          cardId: card.id,
          position: (items._max.position ?? 0) + 1,
          text: dto.text.trim(),
        },
      });
    });
    this.work.publish(projectId, card.id);
  }

  /**
   * `PATCH …/checklist/:itemId`: the text and the order are an operator's;
   * a tick is also the assignee's (D5).
   */
  async updateItem(
    projectId: string,
    number: number,
    itemId: string,
    dto: UpdateTaskChecklistItemDto,
    actor: BoardActor,
  ): Promise<void> {
    const card = await this.task(projectId, number, actor);
    if (
      (dto.text !== undefined || dto.position !== undefined) &&
      !projectRoleAtLeast(actor.role, 'operator')
    ) {
      throw new ForbiddenException(
        "Editing a task's checklist needs the operator role on the project",
      );
    }
    if (dto.done !== undefined) this.assertMayAct(card, actor);
    const item = await this.item(card.id, itemId);
    const data = {
      ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
      ...(dto.position !== undefined ? { position: dto.position } : {}),
      ...(dto.done === undefined || dto.done === (item.doneAt !== null)
        ? {}
        : dto.done
          ? { doneAt: new Date(), doneById: actor.userId }
          : { doneAt: null, doneById: null }),
    };
    if (Object.keys(data).length === 0) return;
    await this.prisma.boardCardChecklistItem.update({
      where: { id: item.id },
      data,
    });
    this.work.publish(projectId, card.id);
  }

  /** `DELETE …/checklist/:itemId` (operator+, by the route). */
  async removeItem(
    projectId: string,
    number: number,
    itemId: string,
    actor: BoardActor,
  ): Promise<void> {
    const card = await this.task(projectId, number, actor);
    const item = await this.item(card.id, itemId);
    await this.prisma.boardCardChecklistItem.delete({ where: { id: item.id } });
    this.work.publish(projectId, card.id);
  }

  /**
   * `POST …/done`: the accept path to Completed (D4), so the task satisfies
   * its dependants as any completed card does. Unticked items do not hold it
   * back (D6). The note is kept on the card.
   */
  async done(
    projectId: string,
    number: number,
    note: string | undefined,
    actor: BoardActor,
  ): Promise<void> {
    const card = await this.task(projectId, number, actor);
    this.assertMayAct(card, actor);
    if (card.column !== 'todo' && card.column !== 'in_progress') {
      throw boardError(
        409,
        BOARD_ERROR.wrongColumn,
        'Done is pressed on a task in To Do or In progress',
      );
    }
    const taskNote = note?.trim() ? note.trim() : null;
    await this.work.move(
      await this.work.project(projectId),
      card,
      {
        to: 'completed',
        index: 0,
        source: 'person',
        within: async (tx, fresh) => {
          await tx.boardCard.update({
            where: { id: fresh.id },
            data: { taskNote },
          });
        },
      },
      actor,
    );
    await this.audit.record({
      ...actor.ctx,
      action: 'card.task_done',
      target: { type: 'board_card', id: card.id },
      projectId,
      after: { number, ...(taskNote ? { note: taskNote } : {}) },
      result: 'ok',
    });
  }

  /** `POST …/reopen`: a done task goes back to the top of To Do. */
  async reopen(
    projectId: string,
    number: number,
    actor: BoardActor,
  ): Promise<void> {
    const card = await this.task(projectId, number, actor);
    this.assertMayAct(card, actor);
    if (card.column !== 'completed') {
      throw boardError(
        409,
        BOARD_ERROR.wrongColumn,
        'Reopen is pressed on a task in Completed',
      );
    }
    await this.work.move(
      await this.work.project(projectId),
      card,
      {
        to: 'todo',
        index: 0,
        source: 'person',
        within: async (tx, fresh) => {
          await tx.boardCard.update({
            where: { id: fresh.id },
            data: { taskNote: null },
          });
        },
      },
      actor,
    );
    await this.audit.record({
      ...actor.ctx,
      action: 'card.task_reopened',
      target: { type: 'board_card', id: card.id },
      projectId,
      after: { number },
      result: 'ok',
    });
  }

  /** The task `number` as `actor` may see it: 404 hidden, 409 not a task. */
  private async task(
    projectId: string,
    number: number,
    actor: BoardActor,
  ): Promise<CardWithRounds> {
    const card = await this.work.card(projectId, number);
    if (hiddenFrom(card, actor.role)) throw cardNotFound();
    if (card.kind !== 'task') throw notATask(card);
    return card;
  }

  /** D5: an operator or above, or the task's own assignee. */
  private assertMayAct(
    card: Pick<BoardCard, 'assigneeId'>,
    actor: BoardActor,
  ): void {
    if (actor.userId !== null && mayActOnTask(actor.role, actor.userId, card)) {
      return;
    }
    throw new ForbiddenException(
      'Only the assignee or an operator may act on this task',
    );
  }

  private async item(cardId: string, itemId: string) {
    const item = await this.prisma.boardCardChecklistItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.cardId !== cardId) throw itemNotFound();
    return item;
  }
}
