-- C-397, ADR-0098: a person moved a fleet card; the mirror no longer moves or deletes it.

-- AlterTable
ALTER TABLE "board_cards" ADD COLUMN     "fleetDetached" BOOLEAN NOT NULL DEFAULT false;
