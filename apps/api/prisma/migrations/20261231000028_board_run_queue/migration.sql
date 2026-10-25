-- C-398 (ADR-0102): the stack run queue becomes the Board's run queue — a
-- card a Run at `maxRunning` left waiting for a slot sits in it beside the
-- cards of stack runs (#652). Renamed, so queued stack cards are kept.
-- AlterEnum
ALTER TYPE "BoardStackRunCardStatus" RENAME TO "BoardRunQueueStatus";

-- AlterTable
ALTER TABLE "board_stack_run_cards" RENAME TO "board_run_queue";
ALTER TABLE "board_run_queue" RENAME CONSTRAINT "board_stack_run_cards_pkey" TO "board_run_queue_pkey";
ALTER TABLE "board_run_queue" RENAME CONSTRAINT "board_stack_run_cards_runId_fkey" TO "board_run_queue_runId_fkey";
ALTER TABLE "board_run_queue" RENAME CONSTRAINT "board_stack_run_cards_cardId_fkey" TO "board_run_queue_cardId_fkey";
ALTER INDEX "board_stack_run_cards_cardId_key" RENAME TO "board_run_queue_cardId_key";
ALTER INDEX "board_stack_run_cards_runId_idx" RENAME TO "board_run_queue_runId_idx";

ALTER TABLE "board_run_queue" ALTER COLUMN "runId" DROP NOT NULL,
ADD COLUMN     "queuedById" TEXT,
ADD COLUMN     "queuedByRole" TEXT,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "autoRunAfter" INTEGER;

-- CreateIndex
CREATE INDEX "board_run_queue_queuedById_idx" ON "board_run_queue"("queuedById");

-- AddForeignKey
ALTER TABLE "board_run_queue" ADD CONSTRAINT "board_run_queue_queuedById_fkey" FOREIGN KEY ("queuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
