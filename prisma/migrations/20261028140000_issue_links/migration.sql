-- Vínculos muchos a muchos entre issues y features/tareas (tablas implícitas de Prisma).
-- Prisma ordena las columnas por nombre de modelo: en _IssueFeatures A = Feature y B = Issue;
-- en _IssueTasks A = Issue y B = Task. Borrar cualquiera de los dos lados borra el vínculo.
-- Que ambos sean del mismo proyecto lo exige el código (projects.server.ts).

-- CreateTable
CREATE TABLE "_IssueFeatures" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssueFeatures_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_IssueTasks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssueTasks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_IssueFeatures_B_index" ON "_IssueFeatures"("B");

-- CreateIndex
CREATE INDEX "_IssueTasks_B_index" ON "_IssueTasks"("B");

-- AddForeignKey
ALTER TABLE "_IssueFeatures" ADD CONSTRAINT "_IssueFeatures_A_fkey" FOREIGN KEY ("A") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueFeatures" ADD CONSTRAINT "_IssueFeatures_B_fkey" FOREIGN KEY ("B") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueTasks" ADD CONSTRAINT "_IssueTasks_A_fkey" FOREIGN KEY ("A") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueTasks" ADD CONSTRAINT "_IssueTasks_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
