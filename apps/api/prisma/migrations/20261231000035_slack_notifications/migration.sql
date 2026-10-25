-- CreateEnum
CREATE TYPE "SlackDeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "slack_webhooks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "urlCiphertext" TEXT NOT NULL,
    "urlHint" TEXT NOT NULL,
    "events" TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eventId" BIGINT,
    "message" JSONB NOT NULL,
    "status" "SlackDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "responseCode" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_webhooks_projectId_key" ON "slack_webhooks"("projectId");

-- CreateIndex
-- One workspace-wide webhook: NULLs are distinct in the unique index above.
CREATE UNIQUE INDEX "slack_webhooks_workspace_key" ON "slack_webhooks"((true)) WHERE "projectId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "slack_deliveries_webhookId_eventId_kind_key" ON "slack_deliveries"("webhookId", "eventId", "kind");

-- CreateIndex
CREATE INDEX "slack_deliveries_status_nextAttemptAt_idx" ON "slack_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "slack_deliveries_webhookId_createdAt_idx" ON "slack_deliveries"("webhookId", "createdAt");

-- AddForeignKey
ALTER TABLE "slack_webhooks" ADD CONSTRAINT "slack_webhooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_webhooks" ADD CONSTRAINT "slack_webhooks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_deliveries" ADD CONSTRAINT "slack_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "slack_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_deliveries" ADD CONSTRAINT "slack_deliveries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
