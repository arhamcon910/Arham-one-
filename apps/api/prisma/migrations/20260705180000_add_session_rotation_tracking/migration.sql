-- AlterTable
ALTER TABLE "public"."Session" ADD COLUMN     "lastIpAddress" TEXT,
ADD COLUMN     "lastUserAgent" TEXT,
ADD COLUMN     "rotationCounter" INTEGER NOT NULL DEFAULT 0;
