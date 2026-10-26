-- C-414 (ADR-0114): a red card PR head is re-run once before its first ci_fix round.
ALTER TABLE "board_cards" ADD COLUMN     "ciRerunSha" TEXT;
