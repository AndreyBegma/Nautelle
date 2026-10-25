-- CreateEnum
CREATE TYPE "CardPauseReason" AS ENUM ('budget');

-- AlterTable
ALTER TABLE "board_card_rounds" ADD COLUMN     "pausedFor" "CardPauseReason";
