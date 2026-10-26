-- CreateEnum
CREATE TYPE "PasswordResetKind" AS ENUM ('password', 'two_factor');

-- CreateEnum
CREATE TYPE "PasswordResetVia" AS ENUM ('admin', 'email');

-- CreateTable
CREATE TABLE "password_reset_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "PasswordResetKind" NOT NULL,
    "via" "PasswordResetVia" NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_links_tokenHash_key" ON "password_reset_links"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_links_userId_idx" ON "password_reset_links"("userId");

-- CreateIndex
CREATE INDEX "password_reset_links_expiresAt_idx" ON "password_reset_links"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_reset_links" ADD CONSTRAINT "password_reset_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_links" ADD CONSTRAINT "password_reset_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
