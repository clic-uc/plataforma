-- Standup pasa a ser uno por persona y semana. La fecha existente se convierte
-- en el lunes de su semana (date_trunc('week') parte en lunes) y conserva su
-- valor como createdAt/updatedAt. Si alguien tenía dos en la misma semana, queda
-- el más reciente.
DELETE FROM "Standup" a
USING "Standup" b
WHERE a."memberId" = b."memberId"
  AND date_trunc('week', a."date") = date_trunc('week', b."date")
  AND (a."date", a."id") < (b."date", b."id");

ALTER TABLE "Standup"
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "learned" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

UPDATE "Standup" SET "createdAt" = "date", "updatedAt" = "date", "date" = date_trunc('week', "date");

ALTER TABLE "Standup" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Standup" RENAME COLUMN "date" TO "weekStart";

-- CreateIndex
CREATE UNIQUE INDEX "Standup_memberId_weekStart_key" ON "Standup"("memberId", "weekStart");

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_memberId_date_idx" ON "TimeEntry"("memberId", "date");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
