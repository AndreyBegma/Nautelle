-- CreateEnum
CREATE TYPE "ToolUseRuleScope" AS ENUM ('session', 'project');

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "toolUseTimeoutMinutes" INTEGER;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "toolUseTimeoutMinutes" INTEGER;

-- AlterTable
ALTER TABLE "action_requests" ADD COLUMN     "ruleId" TEXT;

-- CreateTable
CREATE TABLE "tool_use_rules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" "ToolUseRuleScope" NOT NULL,
    "sessionId" TEXT,
    "toolName" TEXT NOT NULL,
    "ruleContent" TEXT,
    "createdById" TEXT,
    "sourceRequestId" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_use_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_use_rules_projectId_scope_createdAt_idx" ON "tool_use_rules"("projectId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "tool_use_rules_sessionId_idx" ON "tool_use_rules"("sessionId");

-- AddForeignKey
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "tool_use_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_use_rules" ADD CONSTRAINT "tool_use_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_use_rules" ADD CONSTRAINT "tool_use_rules_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_use_rules" ADD CONSTRAINT "tool_use_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_use_rules" ADD CONSTRAINT "tool_use_rules_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "action_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

