-- C-396: the latest `git push --dry-run` a runner ran for a checkout.
-- CreateTable
CREATE TABLE "repository_push_checks" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "remote" TEXT,
    "message" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_push_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repository_push_checks_runnerId_rootPath_key" ON "repository_push_checks"("runnerId", "rootPath");

-- AddForeignKey
ALTER TABLE "repository_push_checks" ADD CONSTRAINT "repository_push_checks_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "runners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
