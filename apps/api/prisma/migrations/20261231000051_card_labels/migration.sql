-- C-497 (ADR-0125): card labels. A project owns its labels and path rules;
-- each card-label row records who set it. Every existing project gets the
-- starter set (shared `STARTER_LABELS`, `STARTER_LABEL_RULES`).

-- CreateEnum
CREATE TYPE "CardLabelSource" AS ENUM ('person', 'model', 'paths');

-- AlterEnum: the model's labels for a new card (C-500). Nothing below uses it.
ALTER TYPE "LlmFeature" ADD VALUE 'card_labels';

-- AlterTable
ALTER TABLE "board_settings" ADD COLUMN     "labelPaths" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "labelSuggest" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "project_labels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hue" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "combines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_label_path_rules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "project_label_path_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_labels" (
    "cardId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "source" "CardLabelSource" NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "setById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_card_labels_pkey" PRIMARY KEY ("cardId","labelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_labels_projectId_name_key" ON "project_labels"("projectId", "name");

-- CreateIndex
CREATE INDEX "project_label_path_rules_projectId_idx" ON "project_label_path_rules"("projectId");

-- CreateIndex
CREATE INDEX "project_label_path_rules_labelId_idx" ON "project_label_path_rules"("labelId");

-- CreateIndex
CREATE INDEX "board_card_labels_labelId_idx" ON "board_card_labels"("labelId");

-- AddForeignKey
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_label_path_rules" ADD CONSTRAINT "project_label_path_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_label_path_rules" ADD CONSTRAINT "project_label_path_rules_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_labels" ADD CONSTRAINT "board_card_labels_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_labels" ADD CONSTRAINT "board_card_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the starter labels of every existing project (D1, D3).
INSERT INTO "project_labels" ("id", "projectId", "name", "hue", "position", "updatedAt")
SELECT gen_random_uuid()::text, p."id", s."name", s."hue", s."position", CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN (VALUES
    ('frontend', 1, 0),
    ('backend', 3, 1),
    ('fullstack', 2, 2),
    ('redesign', 8, 3),
    ('infra', 5, 4),
    ('docs', 7, 5)
) AS s("name", "hue", "position");

-- Backfill: the starter path rules, in order.
INSERT INTO "project_label_path_rules" ("id", "projectId", "labelId", "pattern", "position")
SELECT gen_random_uuid()::text, l."projectId", l."id", r."pattern", r."position"
FROM (VALUES
    ('apps/web/**', 'frontend', 0),
    ('apps/api/**', 'backend', 1),
    ('docs/**', 'docs', 2),
    ('deploy/**', 'infra', 3),
    ('.woodpecker/**', 'infra', 4)
) AS r("pattern", "label", "position")
JOIN "project_labels" l ON l."name" = r."label";

-- Backfill: fullstack combines frontend and backend (D6).
UPDATE "project_labels" f
SET "combines" = ARRAY[fe."id", be."id"]
FROM "project_labels" fe, "project_labels" be
WHERE f."name" = 'fullstack'
  AND fe."projectId" = f."projectId" AND fe."name" = 'frontend'
  AND be."projectId" = f."projectId" AND be."name" = 'backend';
