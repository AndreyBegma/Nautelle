import {
  type BoardColumn,
  type CardDependencyRef,
  type CardReadiness,
  isDependencySatisfied,
  openDependencies,
  unmergedDependencies,
} from '@nautelle/shared';

/**
 * Card dependencies (#337 D8): "after C-12" on the face, the list in the
 * sheet, and why Run is held while one is still open (#638, ADR-0065). They
 * never block a move or Accept.
 */

/** Labels the face names before it says "+n". */
const CHIP_LABELS_MAX = 2;

export interface DependencyChip {
  text: string;
  /** Some dependency is not in Finished or Completed: the chip warns. */
  open: boolean;
  /** Every dependency, for the chip's tooltip. */
  title: string;
}

/** The face's chip; null when the card depends on nothing. */
export function dependencyChip(
  dependsOn: readonly CardDependencyRef[] | undefined,
): DependencyChip | null {
  if (!dependsOn || dependsOn.length === 0) return null;
  const labels = dependsOn.map((d) => d.label);
  const shown = labels.slice(0, CHIP_LABELS_MAX).join(', ');
  const more = labels.length - CHIP_LABELS_MAX;
  const open = openDependencies(dependsOn);
  return {
    text: `after ${shown}${more > 0 ? ` +${more}` : ''}`,
    open: open.length > 0,
    title:
      open.length > 0
        ? `Runs after ${labels.join(', ')}. No ready pull request yet: ${open
            .map((d) => d.label)
            .join(', ')}.`
        : `Runs after ${labels.join(', ')}, all ready.`,
  };
}

/** The sheet's add field: a card number, `12` or `C-12`; null when it is not one. */
export function parseCardNumber(raw: string): number | null {
  const match = /^\s*(?:c-?)?(\d{1,9})\s*$/i.exec(raw);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

/**
 * Whether a dependency still holds its dependant back: until it is in
 * Finished (a ready pull request) or Completed (#638).
 */
export const isOpenDependency = (column: BoardColumn): boolean =>
  !isDependencySatisfied(column);

/** "C-84" / "C-84 and C-86" / "C-84, C-86 and C-90". */
export const labelList = (
  refs: readonly Pick<CardDependencyRef, 'label'>[],
) => {
  const labels = refs.map((d) => d.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
};

/** C-417: "C-1 and C-2 are not merged yet; a card branches from one dependency only". */
const unmergedText = (unmerged: readonly CardDependencyRef[]) =>
  `${labelList(unmerged)} are not merged yet; a card branches from one dependency only`;

/**
 * #638: why Run is held — "Waits for C-13, C-14 and C-16" — or null when
 * every dependency is in Finished or Completed. The API refuses such a Run
 * with 409 `dependency_open`; there is no override. C-417: with all of them
 * satisfied, more than one not merged holds it too (`dependencies_unmerged`).
 */
export function runWaitsFor(
  dependsOn: readonly CardDependencyRef[] | null | undefined,
): string | null {
  const open = openDependencies(dependsOn ?? []);
  if (open.length > 0) return `Waits for ${labelList(open)}`;
  const unmerged = unmergedDependencies(dependsOn ?? []);
  return unmerged.length > 0 ? unmergedText(unmerged) : null;
}

/** #443: the face's Ready / Waiting chip, and what a waiting card waits for. */
export interface ReadinessChip {
  text: string;
  tone: 'ok' | 'warn';
  title: string;
  /** "Waits for C-84"; null when the card is ready. */
  waitsFor: string | null;
}

/** #443: null for a card without readiness (not in To Do, or no dependency). */
export function readinessChip(
  readiness: CardReadiness | null | undefined,
): ReadinessChip | null {
  if (!readiness) return null;
  if (readiness.state === 'ready') {
    return {
      text: 'Ready',
      tone: 'ok',
      title:
        'Every card it depends on has a ready pull request or is accepted.',
      waitsFor: null,
    };
  }
  if (readiness.state === 'blocked') {
    const reason = unmergedText(readiness.unmerged);
    return {
      text: `Blocked · merge one of ${readiness.unmerged.map((d) => d.label).join(', ')}`,
      tone: 'warn',
      title: `${reason}.`,
      waitsFor: reason,
    };
  }
  const waitsFor = `Waits for ${labelList(readiness.open)}`;
  return {
    text: `Waiting · ${readiness.satisfied} of ${readiness.total}`,
    tone: 'warn',
    title: `${waitsFor}. ${readiness.satisfied} of ${readiness.total} ready.`,
    waitsFor,
  };
}

/** #443: what Auto-run when ready will do, under its switch. */
export function autoRunNote(
  on: boolean,
  readiness: CardReadiness | null | undefined,
): string {
  if (!on) return 'Nothing starts on its own. Press Run when you are ready.';
  if (readiness?.state === 'waiting') {
    const open = readiness.open;
    return `Will start automatically once ${labelList(open)} ${open.length === 1 ? 'has a' : 'have'} ready pull request${open.length === 1 ? '' : 's'}.`;
  }
  if (readiness?.state === 'blocked') {
    return `Will not start while ${labelList(readiness.unmerged)} are not merged; it starts once all but one are.`;
  }
  return 'Nothing is left to wait for, so nothing will start it. Press Run.';
}
