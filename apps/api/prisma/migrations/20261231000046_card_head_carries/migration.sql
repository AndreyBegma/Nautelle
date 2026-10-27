-- C-457: the runner's `card.headDelta` answer per pair of a card's PR heads.

-- CreateTable
CREATE TABLE "card_head_carries" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fromSha" TEXT NOT NULL,
    "toSha" TEXT NOT NULL,
    "baseMerge" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_head_carries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_head_carries_cardId_fromSha_toSha_key" ON "card_head_carries"("cardId", "fromSha", "toSha");

-- AddForeignKey
ALTER TABLE "card_head_carries" ADD CONSTRAINT "card_head_carries_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
