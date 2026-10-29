-- Historial de tareas (métricas del kanban), horas vinculadas a tareas y "revisada" por persona
-- en issues. Todo es aditivo: el código desplegado antes de esta migración sigue funcionando.
--
-- Las tareas existentes no tienen historia: reciben createdAt = ahora y una fila inicial en
-- TaskTransition con su columna y asignado actuales. Sus duraciones cuentan desde esta migración.
-- Ninguna issue existente queda revisada por nadie.

-- CreateEnum
CREATE TYPE "TaskDifficulty" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "TimeEntryKind" AS ENUM ('MANUAL', 'TRABAJO', 'REVISION');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "difficulty" "TaskDifficulty";

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "kind" "TimeEntryKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "IssueReview" (
    "issueId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueReview_pkey" PRIMARY KEY ("issueId","memberId")
);

-- CreateTable
CREATE TABLE "TaskTransition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromColumn" "KanbanColumn",
    "toColumn" "KanbanColumn" NOT NULL,
    "assigneeId" TEXT,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueReview_memberId_idx" ON "IssueReview"("memberId");

-- CreateIndex
CREATE INDEX "TaskTransition_taskId_at_idx" ON "TaskTransition"("taskId", "at");

-- CreateIndex
CREATE INDEX "TaskTransition_toColumn_at_idx" ON "TaskTransition"("toColumn", "at");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");

-- AddForeignKey
ALTER TABLE "IssueReview" ADD CONSTRAINT "IssueReview_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueReview" ADD CONSTRAINT "IssueReview_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransition" ADD CONSTRAINT "TaskTransition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransition" ADD CONSTRAINT "TaskTransition_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransition" ADD CONSTRAINT "TaskTransition_byId_fkey" FOREIGN KEY ("byId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: período inicial de cada tarea existente.
INSERT INTO "TaskTransition" ("id", "taskId", "fromColumn", "toColumn", "assigneeId", "byId", "at")
SELECT gen_random_uuid()::text, "id", NULL, "column", "assigneeId", NULL, CURRENT_TIMESTAMP
FROM "Task";
