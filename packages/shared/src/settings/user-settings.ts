import { isClaudeModelAlias } from '../models/catalog';

/**
 * A person's own settings (#337 D9), `user_settings`: one row per user, read
 * and written only by that user through `/me/settings`. No row: the
 * defaults.
 */

/** #337 D9: what New Card and New Plan preselect for a person with no setting. */
export const PLANNING_MODEL_DEFAULT = 'sonnet';

/** `GET /me/settings`, and the answer of `PUT /me/settings`. */
export interface UserSettingsView {
  /** The stored value, else `PLANNING_MODEL_DEFAULT`. */
  planningModel: string;
  /**
   * C-401: how long a tool-use request of this person's sessions waits for a
   * decision, in minutes, where the project sets none; null is the default
   * (`TOOL_USE_TIMEOUT_DEFAULT_MINUTES`).
   */
  toolUseTimeoutMinutes: number | null;
}

/**
 * `PUT /me/settings`: at least one field. `planningModel` is an alias of the
 * model catalog (`CLAUDE_MODELS`, #322 D4); `toolUseTimeoutMinutes` is 1–720
 * (C-401). `null` clears a field back to its default; an absent one is kept.
 */
export interface UpdateUserSettingsRequest {
  planningModel?: string | null;
  toolUseTimeoutMinutes?: number | null;
}

/** The planning model of a stored `user_settings.planningModel` (null: no row or cleared). */
export const resolvePlanningModel = (stored: string | null | undefined) =>
  stored?.trim() || PLANNING_MODEL_DEFAULT;

/** What `PUT /me/settings` accepts as `planningModel`: a catalog alias, or null. */
export const isPlanningModel = (value: string | null): boolean =>
  value === null || isClaudeModelAlias(value);
