import {
  APP_VERSION,
  isPlanningModel,
  resolvePlanningModel,
  type UpdateUserSettingsRequest,
  type UserSettingsView,
  type WhatsNewView,
  whatsNewView,
} from '@nautelle/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';

/**
 * A person's own settings (#337 D9, `user_settings`). Every read and write is
 * keyed by the caller's id alone: there is no route that names another user.
 */
@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string): Promise<UserSettingsView> {
    const row = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { planningModel: true, toolUseTimeoutMinutes: true },
    });
    return {
      planningModel: resolvePlanningModel(row?.planningModel),
      toolUseTimeoutMinutes: row?.toolUseTimeoutMinutes ?? null,
    };
  }

  /** The model New Card and New Plan preselect, and a plan takes by default. */
  async planningModel(userId: string): Promise<string> {
    return (await this.get(userId)).planningModel;
  }

  /**
   * Writes the fields given; `null` clears one back to its default
   * (`PLANNING_MODEL_DEFAULT`, the five-minute tool-use timeout).
   */
  async update(
    userId: string,
    change: UpdateUserSettingsRequest,
    ctx: AuditContext,
  ): Promise<UserSettingsView> {
    const { planningModel, toolUseTimeoutMinutes } = change;
    if (planningModel === undefined && toolUseTimeoutMinutes === undefined) {
      throw new BadRequestException(
        'Give planningModel or toolUseTimeoutMinutes',
      );
    }
    if (planningModel !== undefined && !isPlanningModel(planningModel)) {
      throw new BadRequestException(
        'planningModel must be a model of the catalog, or null',
      );
    }
    const data = {
      ...(planningModel !== undefined ? { planningModel } : {}),
      ...(toolUseTimeoutMinutes !== undefined ? { toolUseTimeoutMinutes } : {}),
    };
    const before = await this.get(userId);
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    const after = await this.get(userId);
    await this.audit.record({
      ...ctx,
      action: 'user.update',
      target: { type: 'user', id: userId },
      before,
      after,
      result: 'ok',
    });
    return after;
  }

  /** C-294: this build's version, and whether the caller has seen it. */
  async whatsNew(userId: string): Promise<WhatsNewView> {
    const row = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { seenVersion: true },
    });
    return whatsNewView(row?.seenVersion);
  }

  /**
   * C-294: the caller opened What's new on this build. Always the API's own
   * `APP_VERSION`, never a version the client names; not audited, as a read
   * receipt changes nothing anyone else sees.
   */
  async markWhatsNewSeen(userId: string): Promise<WhatsNewView> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: { seenVersion: APP_VERSION },
      create: { userId, seenVersion: APP_VERSION },
    });
    return whatsNewView(APP_VERSION);
  }
}
