import {
  type ActionRequestKind,
  rememberableToolRules,
  sameToolRule,
  type ToolRule,
  type ToolRuleScope,
  type ToolRuleView,
  toolRuleAllowing,
  toolRuleLabel,
  toolUseRequestOf,
  toolUseTimeoutMinutes,
} from '@nautelle/shared';
import { Injectable } from '@nestjs/common';
import type { ToolUseRule } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';

/** What the rule checks read of an action request row. */
export interface ToolRuleRequest {
  id: string;
  projectId: string;
  sessionId: string | null;
  kind: ActionRequestKind;
  args: unknown;
}

const asToolRule = (row: ToolUseRule): ToolRule =>
  row.ruleContent === null
    ? { toolName: row.toolName }
    : { toolName: row.toolName, ruleContent: row.ruleContent };

/** The note a request answered by `rule` carries: who decided it, in words. */
export const ruleNote = (rule: ToolUseRule): string =>
  `Allowed by the ${rule.scope} rule ${toolRuleLabel(asToolRule(rule))}`;

/**
 * Tool-use rules (C-401, ADR-0101): "allow similar in this session" and
 * "always allow in this project". The API keeps them and answers a later
 * `tool_use` request from them, so every call still reaches the API — the
 * shared danger check runs on it and every use is audited. A session rule
 * holds for its session only; a project rule until someone removes it.
 */
@Injectable()
export class ToolRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * How long a `tool_use` request waits for a person, in minutes: the
   * project's setting, else the requester's own, else five.
   */
  async timeoutMinutes(
    projectId: string,
    requestedById: string | null,
  ): Promise<number> {
    const [project, account] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { toolUseTimeoutMinutes: true },
      }),
      requestedById
        ? this.prisma.userSettings.findUnique({
            where: { userId: requestedById },
            select: { toolUseTimeoutMinutes: true },
          })
        : null,
    ]);
    return toolUseTimeoutMinutes({
      project: project?.toolUseTimeoutMinutes,
      account: account?.toolUseTimeoutMinutes,
    });
  }

  /**
   * The stored rule that answers a `tool_use` request — a project rule, or a
   * rule of its own session — or null and a person decides. Never for a
   * dangerous call or one that cannot be judged (shared `toolRuleAllowing`).
   */
  async ruleFor(
    request: Omit<ToolRuleRequest, 'id'>,
  ): Promise<ToolUseRule | null> {
    const toolUse = toolUseRequestOf(request);
    if (!toolUse?.call) return null;
    const rows = await this.prisma.toolUseRule.findMany({
      where: {
        projectId: request.projectId,
        OR: [
          { scope: 'project' },
          ...(request.sessionId
            ? [{ scope: 'session' as const, sessionId: request.sessionId }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const match = toolRuleAllowing(
      rows.map((row) => ({ ...asToolRule(row), row })),
      toolUse.call,
      toolUse.suggestions,
    );
    return match?.row ?? null;
  }

  /** A rule answered `requestId`: counted, and audited as the caller. */
  async used(
    rule: ToolUseRule,
    requestId: string,
    ctx: AuditContext,
  ): Promise<void> {
    await this.prisma.toolUseRule.updateMany({
      where: { id: rule.id },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    await this.audit.record({
      ...ctx,
      action: 'tool_rule.used',
      target: { type: 'tool_rule', id: rule.id },
      projectId: rule.projectId,
      after: {
        rule: toolRuleLabel(asToolRule(rule)),
        scope: rule.scope,
        sessionId: rule.sessionId,
      },
      result: 'ok',
      meta: { ruleId: rule.id, actionRequestId: requestId },
    });
  }

  /**
   * The rules remembering `request` would store, or why it may not be
   * remembered: a dangerous call, one that cannot be judged, a rule broader
   * than the call, or a session rule for a request without a session.
   */
  offer(
    request: ToolRuleRequest,
    scope: ToolRuleScope,
  ): { ok: true; rules: ToolRule[] } | { ok: false; reason: string } {
    const toolUse = toolUseRequestOf(request);
    if (!toolUse) {
      return { ok: false, reason: 'Only a tool-use request can be remembered' };
    }
    if (scope === 'session' && request.sessionId === null) {
      return {
        ok: false,
        reason: 'The request has no session to remember it for',
      };
    }
    return rememberableToolRules(toolUse.call, toolUse.suggestions);
  }

  /**
   * Stores `rules` for `scope`, skipping those already stored there, and
   * audits each one as `userId`.
   */
  async remember(
    request: ToolRuleRequest,
    scope: ToolRuleScope,
    rules: readonly ToolRule[],
    userId: string,
    ctx: AuditContext,
  ): Promise<ToolUseRule[]> {
    const sessionId = scope === 'session' ? request.sessionId : null;
    const existing = (
      await this.prisma.toolUseRule.findMany({
        where: { projectId: request.projectId, scope, sessionId },
      })
    ).map(asToolRule);
    const created: ToolUseRule[] = [];
    for (const rule of rules) {
      if (existing.some((r) => sameToolRule(r, rule))) continue;
      existing.push(rule);
      const row = await this.prisma.toolUseRule.create({
        data: {
          projectId: request.projectId,
          scope,
          sessionId,
          toolName: rule.toolName,
          ruleContent: rule.ruleContent ?? null,
          createdById: userId,
          sourceRequestId: request.id,
        },
      });
      created.push(row);
      await this.audit.record({
        ...ctx,
        action: 'tool_rule.created',
        target: { type: 'tool_rule', id: row.id },
        projectId: row.projectId,
        after: {
          rule: toolRuleLabel(rule),
          scope,
          sessionId,
          actionRequestId: request.id,
        },
        result: 'ok',
      });
    }
    return created;
  }

  /** `GET /projects/:id/tool-rules`: project rules, then session rules, newest first. */
  async list(projectId: string): Promise<ToolRuleView[]> {
    const rows = await this.prisma.toolUseRule.findMany({
      where: { projectId },
      include: { createdBy: { select: { email: true } } },
      orderBy: [{ scope: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map((row) => ({
      ...asToolRule(row),
      id: row.id,
      scope: row.scope,
      sessionId: row.sessionId,
      label: toolRuleLabel(asToolRule(row)),
      createdById: row.createdById,
      createdByEmail: row.createdBy?.email ?? null,
      sourceRequestId: row.sourceRequestId,
      useCount: row.useCount,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Removes a rule of the project; false when there is none with `id`. */
  async remove(
    projectId: string,
    id: string,
    ctx: AuditContext,
  ): Promise<boolean> {
    const row = await this.prisma.toolUseRule.findFirst({
      where: { id, projectId },
    });
    if (!row) return false;
    await this.prisma.toolUseRule.deleteMany({ where: { id } });
    await this.audit.record({
      ...ctx,
      action: 'tool_rule.deleted',
      target: { type: 'tool_rule', id },
      projectId,
      before: {
        rule: toolRuleLabel(asToolRule(row)),
        scope: row.scope,
        sessionId: row.sessionId,
        useCount: row.useCount,
      },
      result: 'ok',
    });
    return true;
  }
}
