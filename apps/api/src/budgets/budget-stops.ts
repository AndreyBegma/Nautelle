import type { BudgetScope } from '@nautelle/shared';
import { Injectable, Logger } from '@nestjs/common';

/**
 * C-399 (ADR-0100): a hard (`stop`) budget whose current period has reached
 * its limit, with no override lifting it — what the gate refuses new spend
 * for. Emitted after every evaluation that finds it so, not once: a listener
 * that could not act (a runner offline) acts on the next one.
 */
export interface BudgetStop {
  budgetId: string;
  scope: BudgetScope;
  /** Set for a `project` budget. */
  projectId: string | null;
  /** Set for a `user` budget. */
  userId: string | null;
  /** The limit, a decimal string. */
  limitUsd: string;
  /** When the period resets. */
  resetsAt: Date;
}

/**
 * Acts on a stop in the background: it must not hold the evaluation, which
 * runs on spend, a sweep or a person's request.
 */
export type BudgetStopListener = (stop: BudgetStop) => void;

/**
 * Hands budget stops to whoever acts on running work — the Board pauses its
 * card rounds. Budgets know nothing of the Board: the Board subscribes.
 */
@Injectable()
export class BudgetStops {
  private readonly logger = new Logger(BudgetStops.name);
  private readonly listeners: BudgetStopListener[] = [];

  subscribe(listener: BudgetStopListener): void {
    this.listeners.push(listener);
  }

  /** Calls every listener; a throwing one is logged, never rethrown. */
  emit(stop: BudgetStop): void {
    for (const listener of this.listeners) {
      try {
        listener(stop);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `budget ${stop.budgetId} stop not acted on: ${reason}`,
        );
      }
    }
  }
}
