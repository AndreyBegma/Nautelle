-- C-477 (ADR-0107): a move to another runner gives a plan a new session;
-- only turns after this moment ran in it.
ALTER TABLE "plans" ADD COLUMN "sessionSince" TIMESTAMP(3);
