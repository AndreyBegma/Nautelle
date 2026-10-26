import {
  ACTION_REQUEST_CARD_TITLE_MAX,
  ACTION_REQUEST_PR_TITLE_MAX,
  ACTION_REQUEST_TTL_MS,
  type ActionRequestArgs,
  type ActionRequestKind,
  type ActionRequestStatus,
  type ActionRequestSummary,
  APPROVALS_ERROR,
  actionRequestArgsSchemas,
  BOARD_ERROR,
  cardAcceptBoundArgsSchema,
  cardLabel,
  mayDecideActionRequest,
  prApproveBoundArgsSchema,
  type Role,
  shortHeadSha,
  type ToolRuleScope,
} from '@nautelle/shared';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { ActionRequest, Prisma } from '@prisma/client';
import { z } from 'zod';
import { type ApprovalsCaller, ApprovalsService } from '../approvals';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { BoardService } from '../board/board.service';
import { BoardFailure, boardError, cardNotFound } from '../board/board-error';
import { ControlService } from '../control/control.service';
import { PrismaService } from '../database/prisma.service';
import { LiveService } from '../live/live.service';
import { oneLine } from '../notifications/event-mapping';
import { NotificationWriter } from '../notifications/notification-writer';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../queue/queue.service';
import {
  ACTION_REQUESTS_LIVE_EVENT,
  type ActionRequestsLiveChange,
  type ActionRequestView,
  actionRequestBody,
  actionRequestLink,
  actionRequestTitle,
  toActionRequestSummary,
  toActionRequestView,
} from './action-request-mapper';
import { httpErrorBody } from './local-error';
import { ruleNote, ToolRulesService } from './tool-rules.service';

/** The error codes of the action-request routes. */
export const ACTION_REQUEST_ERROR = {
  notFound: 'not_found',
  invalidArgs: 'invalid_args',
  /** It was already decided, or it expired. */
  notPending: 'not_pending',
  /** A `pr_approve` for a PR that is merged or closed. */
  prNotOpen: 'pr_not_open',
  /** The requester may not approve their own non-`tool_use` request (D18). */
  selfApproval: 'self_approval',
  /**
   * C-401: "allow similar" or "always allow" on a call that is never
   * remembered — a dangerous one, one shown only in part, a rule broader
   * than the call — or on a request that is not a `tool_use`.
   */
  notRememberable: 'not_rememberable',
} as const;
export type ActionRequestErrorCode =
  (typeof ACTION_REQUEST_ERROR)[keyof typeof ACTION_REQUEST_ERROR];

export const actionRequestError = (
  statusCode: number,
  error: ActionRequestErrorCode,
  message: string,
): HttpException =>
  new HttpException({ statusCode, error, message }, statusCode);

/** A read's view of a row: pending past its deadline is already expired. */
const asSeen = (row: ActionRequest, now: Date): ActionRequest =>
  row.status === 'pending' && row.expiresAt <= now
    ? { ...row, status: 'expired' }
    : row;

const notFound = () =>
  actionRequestError(
    404,
    ACTION_REQUEST_ERROR.notFound,
    'Action request not found',
  );

/** What a local request asks for (spec 201 D7 `action.request`). */
export interface NewActionRequest {
  projectId: string;
  runnerId: string;
  sessionId: string | null;
  /** The runner's local user. */
  requestedById: string | null;
  /** Their capped role on the project: what `pr.inspect` runs with. */
  requesterRole: Role;
  kind: ActionRequestKind;
  args: unknown;
  summary: string;
}

/** Who records the creation: the runner, for its local user (D8). */
export interface ActionRequestAuditor {
  ctx: AuditContext;
  meta?: object;
}

/** A person deciding, from the web or Telegram. */
export interface ActionRequestDecider {
  projectId: string;
  /** Their effective role on the project; at least operator. */
  role: Role;
  user: { id: string; email: string; role: Role };
  ctx: AuditContext;
  via: 'web' | 'telegram';
}

export type ActionRequestDecision = 'approve' | 'deny';

type Outcome =
  | { ok: true; result: Prisma.InputJsonObject }
  | {
      ok: false;
      result: { error: string; message: string; headSha?: string };
    };

/**
 * C-416: a `card_accept` whose PR moved past the bound head — `headSha` is
 * the head now, for the session to file a new request at.
 */
const headMoved = (pr: number | null, headSha: string): Outcome => ({
  ok: false,
  result: {
    error: APPROVALS_ERROR.headMoved,
    message: `The head of #${pr} moved to ${shortHeadSha(headSha)} after the request; nothing was merged — ask again`,
    headSha,
  },
});

/** The Board's `merge_failed` for a head that changed before the merge. */
const isHeadChanged = (error: unknown): boolean =>
  error instanceof BoardFailure &&
  error.code === BOARD_ERROR.mergeFailed &&
  (error.getResponse() as { reason?: unknown }).reason === 'head_changed';

const DECIDED_STATUS: Record<ActionRequestDecision, ActionRequestStatus> = {
  approve: 'approved',
  deny: 'denied',
};

/**
 * Action requests (spec 201 D18): what a Claude Code session asks a person
 * for. Created by a local request, listed and decided in the web or in
 * Telegram, and — once approved — executed as the approver, so the budget
 * gate, the role checks and the audit log see the person who approved it.
 * `tool_use` is never executed: the waiting hook reads the decision.
 */
@Injectable()
export class ActionRequestsService {
  private readonly logger = new Logger(ActionRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly live: LiveService,
    private readonly writer: NotificationWriter,
    private readonly notifications: NotificationsService,
    private readonly control: ControlService,
    private readonly approvals: ApprovalsService,
    private readonly queue: QueueService,
    private readonly board: BoardService,
    private readonly rules: ToolRulesService,
  ) {}

  async create(
    input: NewActionRequest,
    auditor: ActionRequestAuditor,
  ): Promise<ActionRequestSummary> {
    const parsed = actionRequestArgsSchemas[input.kind].safeParse(input.args);
    if (!parsed.success) {
      throw actionRequestError(
        400,
        ACTION_REQUEST_ERROR.invalidArgs,
        `args: ${z.prettifyError(parsed.error)}`,
      );
    }
    const args =
      input.kind === 'pr_approve'
        ? await this.bindPr(input, parsed.data as { pr: number }, auditor)
        : input.kind === 'card_accept'
          ? await this.bindCard(
              input,
              parsed.data as ActionRequestArgs<'card_accept'>,
              auditor,
            )
          : (parsed.data as Record<string, unknown>);
    const now = new Date();
    const ttlMs =
      input.kind === 'tool_use'
        ? (await this.rules.timeoutMinutes(
            input.projectId,
            input.requestedById,
          )) * 60_000
        : ACTION_REQUEST_TTL_MS[input.kind];
    const data = {
      projectId: input.projectId,
      runnerId: input.runnerId,
      sessionId: input.sessionId,
      requestedById: input.requestedById,
      kind: input.kind,
      summary: input.summary,
      args: args as Prisma.InputJsonObject,
      expiresAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
    };
    // C-401: a call the person already allowed similar ones of is answered
    // by the rule, without a notification; the hook reads the approval.
    const rule =
      input.kind === 'tool_use' ? await this.rules.ruleFor(input) : null;
    if (rule) {
      const row = await this.prisma.actionRequest.create({
        data: {
          ...data,
          status: 'approved',
          decidedAt: now,
          note: ruleNote(rule),
          ruleId: rule.id,
        },
      });
      await this.recordCreated(row, args, auditor);
      await this.rules.used(rule, row.id, auditor.ctx);
      this.publish(row);
      return toActionRequestSummary(row);
    }
    const { row, written } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.actionRequest.create({ data });
      // Only those who can decide it: viewers would get a button that refuses.
      const recipients = (
        await this.writer.projectRecipients(tx, input.projectId)
      ).filter((r) => r.role !== 'viewer');
      const written = await this.writer.write(
        tx,
        {
          kind: 'action.requested',
          projectId: input.projectId,
          runnerId: input.runnerId,
          slot: null,
          issue: null,
          title: actionRequestTitle(input.kind, args),
          body:
            oneLine(actionRequestBody(input.kind, args, input.summary), 300) ??
            '',
          link: actionRequestLink(input.projectId, row.id),
          eventId: null,
          at: now,
          fold: false,
        },
        recipients,
      );
      return { row, written };
    });
    await this.recordCreated(row, args, auditor);
    await this.notifications.publish(written);
    this.publish(row);
    return toActionRequestSummary(row);
  }

  private recordCreated(
    row: ActionRequest,
    args: Record<string, unknown>,
    auditor: ActionRequestAuditor,
  ): Promise<void> {
    return this.audit.record({
      ...auditor.ctx,
      action: 'action_request.created',
      target: { type: 'action_request', id: row.id },
      projectId: row.projectId,
      after: {
        kind: row.kind,
        args,
        summary: row.summary,
        sessionId: row.sessionId,
        expiresAt: row.expiresAt,
        ...(row.ruleId ? { status: row.status, ruleId: row.ruleId } : {}),
      },
      result: 'ok',
      ...(auditor.meta ? { meta: auditor.meta } : {}),
    });
  }

  /**
   * A `pr_approve` binds to the head `pr.inspect` reads now: the one the
   * person is shown and, on approval, the only one approved.
   */
  private async bindPr(
    input: NewActionRequest,
    { pr }: { pr: number },
    auditor: ActionRequestAuditor,
  ): Promise<Record<string, unknown>> {
    const inspection = await this.approvals.inspect(
      {
        projectId: input.projectId,
        role: input.requesterRole,
        ctx: auditor.ctx,
      },
      pr,
      { fresh: true },
    );
    if (inspection.state !== 'open') {
      throw actionRequestError(
        409,
        ACTION_REQUEST_ERROR.prNotOpen,
        `PR #${pr} is ${inspection.state}`,
      );
    }
    return prApproveBoundArgsSchema.parse({
      pr,
      headSha: inspection.headSha,
      title: inspection.title.slice(0, ACTION_REQUEST_PR_TITLE_MAX),
      url: inspection.url,
    });
  }

  /**
   * #845 D5 (ADR-0083 §10): a `card_accept` binds the card as the API reads
   * it now — its title and pull request are what the approver is shown,
   * never the session's words. Only a card in Finished is accepted. C-416:
   * a merging accept also binds the head — the card's `ciHeadSha`, or the PR
   * as `pr.inspect` reads it — and the approval merges only that head.
   */
  private async bindCard(
    input: NewActionRequest,
    { card: number, merge }: ActionRequestArgs<'card_accept'>,
    auditor: ActionRequestAuditor,
  ): Promise<Record<string, unknown>> {
    const card = await this.prisma.boardCard.findUnique({
      where: { projectId_number: { projectId: input.projectId, number } },
      select: {
        number: true,
        title: true,
        column: true,
        prNumber: true,
        prUrl: true,
        ciHeadSha: true,
      },
    });
    if (!card) throw cardNotFound();
    if (card.column !== 'finished') {
      throw boardError(
        409,
        BOARD_ERROR.wrongColumn,
        `Only a card in Finished is accepted; ${cardLabel(number)} is in ${card.column}`,
      );
    }
    const pr = card.prNumber;
    const headSha =
      merge === true && pr !== null
        ? (card.ciHeadSha ??
          (
            await this.board.pullRequest(input.projectId, number, {
              userId: input.requestedById,
              role: input.requesterRole,
              ctx: auditor.ctx,
            })
          ).headSha)
        : null;
    return cardAcceptBoundArgsSchema.parse({
      card: card.number,
      ...(merge !== undefined ? { merge } : {}),
      title: card.title.slice(0, ACTION_REQUEST_CARD_TITLE_MAX),
      prNumber: pr,
      prUrl: card.prUrl && /^https?:\/\//.test(card.prUrl) ? card.prUrl : null,
      headSha,
    });
  }

  /**
   * Reads never write: a pending row past `expiresAt` is shown as `expired`
   * here and moved by the every-minute sweep (`ActionRequestExpiryJob`).
   */
  async list(
    projectId: string,
    status?: ActionRequestStatus,
  ): Promise<ActionRequestView[]> {
    const now = new Date();
    const due = { status: 'pending' as const, expiresAt: { lte: now } };
    const where: Prisma.ActionRequestWhereInput =
      status === 'pending'
        ? { projectId, status, expiresAt: { gt: now } }
        : status === 'expired'
          ? { projectId, OR: [{ status }, due] }
          : { projectId, ...(status ? { status } : {}) };
    const rows = await this.prisma.actionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => toActionRequestView(asSeen(row, now)));
  }

  /** `action.status`: one request of the project, a due one shown as expired. */
  async status(projectId: string, id: string): Promise<ActionRequestSummary> {
    const row = await this.prisma.actionRequest.findFirst({
      where: { id, projectId },
    });
    if (!row) throw notFound();
    return toActionRequestSummary(asSeen(row, new Date()));
  }

  /** The pending requests of a project, oldest first (`approvals.list`). */
  async pending(projectId: string): Promise<ActionRequestSummary[]> {
    const rows = await this.prisma.actionRequest.findMany({
      where: { projectId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return rows.map(toActionRequestSummary);
  }

  /**
   * Approve or deny (D18). Operator on the project is the caller's check
   * (route guard, Telegram); here: the request is pending and unexpired, and
   * a requester approves their own non-`tool_use` request only as an admin.
   * An approval then executes as the approver; its outcome is the row's
   * `executed` or `failed` status and `result` — the decision stands either way.
   *
   * `remember` (C-401, approving a `tool_use`): also store the rules that
   * answer similar calls — for the request's session, or the project — and
   * answer the pending requests they already cover. A call that may not be
   * remembered is refused before anything is decided.
   */
  async decide(
    decider: ActionRequestDecider,
    id: string,
    decision: ActionRequestDecision,
    note?: string,
    remember?: ToolRuleScope,
  ): Promise<ActionRequestView> {
    const row = await this.prisma.actionRequest.findFirst({
      where: { id, projectId: decider.projectId },
    });
    if (!row) throw notFound();
    const record = (result: 'ok' | 'denied', meta: object = {}) =>
      this.audit.record({
        ...decider.ctx,
        action: 'action_request.decided',
        target: { type: 'action_request', id: row.id },
        projectId: row.projectId,
        after: {
          kind: row.kind,
          decision: DECIDED_STATUS[decision],
          ...(note ? { note } : {}),
          ...(remember ? { remember } : {}),
        },
        result,
        meta: { ...meta, via: decider.via },
      });

    const now = new Date();
    if (row.status === 'pending' && row.expiresAt <= now) await this.expire();
    if (row.status !== 'pending' || row.expiresAt <= now) {
      const error = actionRequestError(
        409,
        ACTION_REQUEST_ERROR.notPending,
        row.expiresAt <= now && row.status === 'pending'
          ? 'The request expired'
          : `The request is already ${row.status}`,
      );
      await record('denied', { reason: ACTION_REQUEST_ERROR.notPending });
      throw error;
    }
    if (
      decision === 'approve' &&
      !mayDecideActionRequest({
        kind: row.kind,
        requestedById: row.requestedById,
        userId: decider.user.id,
        isAdmin: decider.user.role === 'admin',
      })
    ) {
      await record('denied', { reason: ACTION_REQUEST_ERROR.selfApproval });
      throw actionRequestError(
        403,
        ACTION_REQUEST_ERROR.selfApproval,
        'Only another operator or an admin can approve your own request',
      );
    }
    const offer = remember ? this.rules.offer(row, remember) : null;
    const refusal =
      offer === null
        ? null
        : decision !== 'approve'
          ? 'Only an approval can be remembered'
          : offer.ok
            ? null
            : offer.reason;
    if (refusal !== null) {
      await record('denied', { reason: ACTION_REQUEST_ERROR.notRememberable });
      throw actionRequestError(
        409,
        ACTION_REQUEST_ERROR.notRememberable,
        refusal,
      );
    }

    // Only one decision wins: the row moves only while it is still pending.
    const { count } = await this.prisma.actionRequest.updateMany({
      where: { id: row.id, status: 'pending' },
      data: {
        status: DECIDED_STATUS[decision],
        decidedById: decider.user.id,
        decidedAt: now,
        note: note ?? null,
      },
    });
    if (count === 0) {
      await record('denied', { reason: ACTION_REQUEST_ERROR.notPending });
      throw actionRequestError(
        409,
        ACTION_REQUEST_ERROR.notPending,
        'The request was decided meanwhile',
      );
    }
    await record('ok');
    let decided = await this.prisma.actionRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    this.publish(decided);
    if (remember && offer?.ok) {
      await this.rules.remember(
        row,
        remember,
        offer.rules,
        decider.user.id,
        decider.ctx,
      );
      await this.answerPending(row.projectId, decider.ctx);
    }

    if (decision === 'approve' && decided.kind !== 'tool_use') {
      decided = await this.execute(decided, decider);
      this.publish(decided);
    }
    return toActionRequestView(decided);
  }

  /**
   * C-401: the pending `tool_use` requests of a project a stored rule now
   * answers — parallel calls of the session that were waiting — approved by
   * that rule, as `ctx` (the person who stored it).
   */
  private async answerPending(
    projectId: string,
    ctx: AuditContext,
  ): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.actionRequest.findMany({
      where: {
        projectId,
        kind: 'tool_use',
        status: 'pending',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const request of pending) {
      const rule = await this.rules.ruleFor(request);
      if (!rule) continue;
      const { count } = await this.prisma.actionRequest.updateMany({
        where: { id: request.id, status: 'pending' },
        data: {
          status: 'approved',
          decidedAt: now,
          note: ruleNote(rule),
          ruleId: rule.id,
        },
      });
      if (count === 0) continue;
      await this.rules.used(rule, request.id, ctx);
      this.publish({
        ...request,
        status: 'approved',
        decidedAt: now,
        note: ruleNote(rule),
        ruleId: rule.id,
      });
    }
  }

  /** The every-minute sweep (D18): pending requests past `expiresAt` expire. */
  async expire(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.actionRequest.findMany({
      where: { status: 'pending', expiresAt: { lte: now } },
      select: { id: true },
      take: 500,
    });
    if (due.length === 0) return 0;
    const ids = due.map((d) => d.id);
    const { count } = await this.prisma.actionRequest.updateMany({
      where: { id: { in: ids }, status: 'pending' },
      data: { status: 'expired' },
    });
    const expired = await this.prisma.actionRequest.findMany({
      where: { id: { in: ids }, status: 'expired' },
    });
    for (const row of expired) this.publish(row);
    return count;
  }

  /** Runs an approved request as `decider`; the row ends executed or failed. */
  private async execute(
    row: ActionRequest,
    decider: ActionRequestDecider,
  ): Promise<ActionRequest> {
    const outcome = await this.run(row, decider);
    const updated = await this.prisma.actionRequest.update({
      where: { id: row.id },
      data: {
        status: outcome.ok ? 'executed' : 'failed',
        result: outcome.result,
      },
    });
    await this.audit.record({
      ...decider.ctx,
      action: 'action_request.executed',
      target: { type: 'action_request', id: row.id },
      projectId: row.projectId,
      after: { kind: row.kind, args: row.args, result: outcome.result },
      result: outcome.ok ? 'ok' : 'error',
      meta: { via: decider.via },
    });
    return updated;
  }

  private async run(
    row: ActionRequest,
    decider: ActionRequestDecider,
  ): Promise<Outcome> {
    const caller = {
      projectId: row.projectId,
      role: decider.role,
      user: { id: decider.user.id, email: decider.user.email },
      ctx: decider.ctx,
    };
    try {
      switch (row.kind) {
        case 'orchestrator_start': {
          const args = actionRequestArgsSchemas.orchestrator_start.parse(
            row.args,
          );
          const run = await this.control.start(caller, { mode: args.mode });
          return {
            ok: true,
            result: { commandRunId: run.id, status: run.status },
          };
        }
        case 'orchestrator_stop': {
          const run = await this.control.stop(caller);
          return {
            ok: true,
            result: { commandRunId: run.id, status: run.status },
          };
        }
        case 'pr_approve': {
          const bound = prApproveBoundArgsSchema.safeParse(row.args);
          if (!bound.success) {
            // Created before requests were bound to a head: nothing to approve.
            return {
              ok: false,
              result: {
                error: ACTION_REQUEST_ERROR.invalidArgs,
                message:
                  'The request names no head; ask for the approval again',
              },
            };
          }
          const { pr, headSha } = bound.data;
          const approvalsCaller: ApprovalsCaller = {
            projectId: row.projectId,
            role: decider.role,
            ctx: decider.ctx,
          };
          // Only the head the approver was shown; a moved head is refused
          // with `head_moved` and approves nothing.
          await this.approvals.approve(approvalsCaller, pr, headSha);
          return { ok: true, result: { pr, headSha } };
        }
        case 'issue_queue': {
          // C-112: the ready label, through the queue, as the approver.
          const { issue } = actionRequestArgsSchemas.issue_queue.parse(
            row.args,
          );
          await this.queue.queueIssue(
            {
              projectId: row.projectId,
              role: decider.role,
              ctx: decider.ctx,
              meta: { actionRequestId: row.id, via: decider.via },
            },
            issue,
          );
          return { ok: true, result: { issue } };
        }
        case 'tool_use':
          return { ok: true, result: {} };
        case 'card_accept': {
          // #845 D5: the Board's own Accept, as the approver — merging first
          // when asked and the pull request is still open.
          const bound = cardAcceptBoundArgsSchema.parse(row.args);
          const actor = {
            userId: decider.user.id,
            role: decider.role,
            ctx: decider.ctx,
          };
          const pr =
            bound.merge === true && bound.prNumber !== null
              ? await this.board.pullRequest(row.projectId, bound.card, actor)
              : null;
          // C-416: a bound head is the only one merged; a moved one fails
          // the request with the head the PR has now, and merges nothing.
          const pinned = bound.headSha ?? null;
          if (pr?.state === 'open' && pinned && pr.headSha !== pinned) {
            return headMoved(bound.prNumber, pr.headSha);
          }
          let accepted: Awaited<ReturnType<BoardService['accept']>>;
          try {
            accepted = await this.board.accept(
              row.projectId,
              bound.card,
              pr?.state === 'open'
                ? { merge: { headSha: pinned ?? pr.headSha } }
                : {},
              actor,
            );
          } catch (error) {
            // The head moved between the read and the merge.
            if (pinned && isHeadChanged(error)) {
              const now = await this.board.pullRequest(
                row.projectId,
                bound.card,
                actor,
              );
              return headMoved(bound.prNumber, now.headSha);
            }
            throw error;
          }
          return {
            ok: true,
            result: {
              card: bound.card,
              column: accepted.column,
              merged: accepted.merge !== null && !accepted.merge.alreadyMerged,
            },
          };
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        const { code, message } = httpErrorBody(error);
        return {
          ok: false,
          result: { error: code ?? `http_${error.getStatus()}`, message },
        };
      }
      this.logger.error(
        `action request ${row.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        ok: false,
        result: { error: 'internal', message: 'internal error' },
      };
    }
  }

  private publish(row: ActionRequest): void {
    const change: ActionRequestsLiveChange = {
      kind: 'action_requests',
      projectId: row.projectId,
      id: row.id,
      status: row.status,
    };
    try {
      this.live.publish(
        `project:${row.projectId}`,
        ACTION_REQUESTS_LIVE_EVENT,
        change,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `${ACTION_REQUESTS_LIVE_EVENT} not published: ${reason}`,
      );
    }
  }
}
