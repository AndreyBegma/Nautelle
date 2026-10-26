import { projectRoleAtLeast, type Role } from '@nautelle/shared';
import type { LucideIcon } from 'lucide-react';

/** A page's create action, which the capsule's `+` offers below `lg` (#521). */
export interface PageAction {
  /** Stable within the page; the `+` sheet's row id. */
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Hidden from a viewer: the page draws its own button only for an operator. */
  operatorOnly?: boolean;
}

/** What the capsule's `+` does: nothing, run one action, or list several. */
export type CapsuleAction =
  | { kind: 'none' }
  | { kind: 'run'; action: PageAction }
  | { kind: 'sheet'; actions: PageAction[] };

/**
 * The `+` for the page on screen. The page's own actions win; a page inside a
 * project that registers none gets `fallback` (New work on the Board);
 * outside a project there is none. A viewer never sees an operator-only
 * action, and with nothing left there is no `+`. `always` rows (Quick card,
 * C-391) follow the page's own on every page of a project.
 */
export function capsuleAction(
  registered: readonly PageAction[],
  role: Role,
  fallback: PageAction | null,
  always: readonly PageAction[] = [],
): CapsuleAction {
  const own = registered.length > 0 ? registered : fallback ? [fallback] : [];
  const offered = [...own, ...always];
  const actions = offered.filter(
    (action) => !action.operatorOnly || projectRoleAtLeast(role, 'operator'),
  );
  const [only] = actions;
  if (!only) return { kind: 'none' };
  return actions.length === 1
    ? { kind: 'run', action: only }
    : { kind: 'sheet', actions };
}
