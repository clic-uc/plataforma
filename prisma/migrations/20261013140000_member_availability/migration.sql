-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "availability" TEXT[] DEFAULT ARRAY[]::TEXT[];
