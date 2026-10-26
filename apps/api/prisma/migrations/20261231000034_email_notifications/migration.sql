-- AlterEnum
ALTER TYPE "NotificationDeliveryChannel" ADD VALUE 'email';

-- AlterTable
ALTER TABLE "notification_rules" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "notification_email_settings" (
    "userId" TEXT NOT NULL,
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastDigestAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_email_settings_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "notification_email_settings" ADD CONSTRAINT "notification_email_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
