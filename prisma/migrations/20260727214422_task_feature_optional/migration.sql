-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_featureId_fkey";

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "featureId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
