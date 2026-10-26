import { STARTER_LABEL_RULES, STARTER_LABELS } from '@nautelle/shared';
import type { PrismaClient } from '@prisma/client';

type LabelWriter = Pick<PrismaClient, 'projectLabel' | 'projectLabelPathRule'>;

/**
 * C-497 (ADR-0125) D1: writes the starter labels, their path rules and the
 * combinations into a project that has no labels yet — the migration's
 * backfill, for a project created after it. A plain function so the projects
 * module and the demo data call it without the board module.
 */
export const writeStarterLabels = async (
  tx: LabelWriter,
  projectId: string,
): Promise<void> => {
  const created = await tx.projectLabel.createManyAndReturn({
    data: STARTER_LABELS.map(({ name, hue }, position) => ({
      projectId,
      name,
      hue,
      position,
    })),
    select: { id: true, name: true },
  });
  const idOf = new Map(created.map((label) => [label.name, label.id]));
  const id = (name: string): string => {
    const found = idOf.get(name);
    if (found === undefined) {
      throw new Error(`The starter set has no label "${name}"`);
    }
    return found;
  };
  await tx.projectLabelPathRule.createMany({
    data: STARTER_LABEL_RULES.map(({ pattern, label }, position) => ({
      projectId,
      labelId: id(label),
      pattern,
      position,
    })),
  });
  for (const label of STARTER_LABELS) {
    if (label.combines.length === 0) continue;
    await tx.projectLabel.update({
      where: { id: id(label.name) },
      data: { combines: label.combines.map(id) },
    });
  }
};
