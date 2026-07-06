-- AlterTable
ALTER TABLE "public"."Session" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT;
