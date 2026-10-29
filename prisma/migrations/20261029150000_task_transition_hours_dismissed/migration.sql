-- Horas pendientes del Dashboard: el asignado de un período en una columna de trabajo puede
-- descartar registrarle horas. Aditiva.

-- AlterTable
ALTER TABLE "TaskTransition" ADD COLUMN "hoursDismissedAt" TIMESTAMP(3);
