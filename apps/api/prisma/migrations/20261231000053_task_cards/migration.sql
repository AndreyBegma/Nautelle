-- C-509 (ADR-0127): task cards. A task is work a person does — an assignee, a
-- checklist and Done that satisfies its dependants; no session, runner, pull
-- request or demo. A task may name the card it was raised for (C-511).
-- Existing rows are unchanged.

-- AlterEnum
ALTER TYPE "BoardCardKind" ADD VALUE 'task';

-- AlterTable
ALTER TABLE "board_cards" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "raisedForCardId" TEXT,
ADD COLUMN     "taskNote" TEXT;

-- CreateTable
CREATE TABLE "board_card_checklist_items" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_card_checklist_items_cardId_position_idx" ON "board_card_checklist_items"("cardId", "position");

-- CreateIndex
CREATE INDEX "board_cards_assigneeId_column_idx" ON "board_cards"("assigneeId", "column");

-- CreateIndex
CREATE INDEX "board_cards_raisedForCardId_idx" ON "board_cards"("raisedForCardId");

-- AddForeignKey
ALTER TABLE "board_cards" ADD CONSTRAINT "board_cards_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_cards" ADD CONSTRAINT "board_cards_raisedForCardId_fkey" FOREIGN KEY ("raisedForCardId") REFERENCES "board_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_checklist_items" ADD CONSTRAINT "board_card_checklist_items_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_checklist_items" ADD CONSTRAINT "board_card_checklist_items_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
