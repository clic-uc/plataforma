-- AlterTable: add projectId as nullable first so existing rows can be backfilled
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;

-- Backfill projectId from the task's current feature
UPDATE "Task" t
SET "projectId" = f."projectId"
FROM "Feature" f
WHERE t."featureId" = f."id";

-- Every existing row has a featureId today, so the backfill above covers all rows.
-- Make the column required now that it's populated.
ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;

-- Replace the feature-scoped uniqueness with project-scoped uniqueness
DROP INDEX "Task_featureId_label_key";
CREATE UNIQUE INDEX "Task_projectId_label_key" ON "Task"("projectId", "label");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
