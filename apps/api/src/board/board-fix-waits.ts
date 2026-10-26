import { Injectable } from '@nestjs/common';

/** C-418: how long a fix refused for room holds To Do; then the poll retries it. */
export const CARD_FIX_WAIT_MAX_MS = 15 * 60_000;

/** A fix round refused for room: the card, and since when (epoch ms). */
export interface BoardFixWait {
  cardId: string;
  since: number;
}

/**
 * C-418: the `ci_fix` and `review_fix` rounds refused with `max_running`,
 * per project, in memory — after a restart the shipping poll retries them
 * anyway. While a project has one, `BoardRunQueue` starts no To Do card; when
 * a slot frees it asks `BoardShipping.check` for them, oldest first. A wait
 * goes when its card's round starts, when the run queue finds the card out of
 * In progress and Finished, or after `CARD_FIX_WAIT_MAX_MS`.
 */
@Injectable()
export class BoardFixWaits {
  /** Project id → card id → since (epoch ms). */
  private readonly waits = new Map<string, Map<string, number>>();

  /** Records a refused fix; a card already waiting keeps its older `since`. */
  add(projectId: string, cardId: string, since = Date.now()): void {
    let project = this.waits.get(projectId);
    if (!project) {
      project = new Map();
      this.waits.set(projectId, project);
    }
    const known = project.get(cardId);
    project.set(cardId, known === undefined ? since : Math.min(known, since));
  }

  /** Whether the project has a fix waiting that has not expired. */
  has(projectId: string): boolean {
    this.expire(projectId);
    return (this.waits.get(projectId)?.size ?? 0) > 0;
  }

  /** Removes and returns the project's live waits, oldest first. */
  take(projectId: string): BoardFixWait[] {
    this.expire(projectId);
    const project = this.waits.get(projectId);
    if (!project) return [];
    this.waits.delete(projectId);
    return [...project]
      .map(([cardId, since]) => ({ cardId, since }))
      .sort((a, b) => a.since - b.since);
  }

  /** The card's round started: it waits no more. */
  drop(projectId: string, cardId: string): void {
    const project = this.waits.get(projectId);
    if (!project) return;
    project.delete(cardId);
    if (project.size === 0) this.waits.delete(projectId);
  }

  private expire(projectId: string): void {
    const project = this.waits.get(projectId);
    if (!project) return;
    const oldest = Date.now() - CARD_FIX_WAIT_MAX_MS;
    for (const [cardId, since] of project) {
      if (since <= oldest) project.delete(cardId);
    }
    if (project.size === 0) this.waits.delete(projectId);
  }
}
