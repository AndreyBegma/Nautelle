-- C-503 (ADR-0126): analysis cards. An analysis round ends with a report and
-- proposed cards instead of a pull request; a card created from a proposal
-- names the analysis card it came from. Existing rows are unchanged.

-- AlterEnum
ALTER TYPE "BoardCardKind" ADD VALUE 'analysis';

-- CreateEnum
CREATE TYPE "CardProposalKind" AS ENUM ('feature', 'bug', 'task');

-- CreateEnum
CREATE TYPE "CardProposalStatus" AS ENUM ('pending', 'created', 'dismissed');

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "readOnlyViolation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "board_cards" ADD COLUMN     "originCardId" TEXT;

-- AlterTable
ALTER TABLE "board_card_rounds" ADD COLUMN     "report" TEXT;

-- CreateTable
CREATE TABLE "board_card_proposals" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "CardProposalKind" NOT NULL,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dependsOn" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" "CardProposalStatus" NOT NULL DEFAULT 'pending',
    "createdCardId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_card_proposals_createdCardId_key" ON "board_card_proposals"("createdCardId");

-- CreateIndex
CREATE INDEX "board_card_proposals_cardId_status_idx" ON "board_card_proposals"("cardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "board_card_proposals_roundId_position_key" ON "board_card_proposals"("roundId", "position");

-- CreateIndex
CREATE INDEX "board_cards_originCardId_idx" ON "board_cards"("originCardId");

-- AddForeignKey
ALTER TABLE "board_cards" ADD CONSTRAINT "board_cards_originCardId_fkey" FOREIGN KEY ("originCardId") REFERENCES "board_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_proposals" ADD CONSTRAINT "board_card_proposals_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_proposals" ADD CONSTRAINT "board_card_proposals_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "board_card_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_proposals" ADD CONSTRAINT "board_card_proposals_createdCardId_fkey" FOREIGN KEY ("createdCardId") REFERENCES "board_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_proposals" ADD CONSTRAINT "board_card_proposals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
