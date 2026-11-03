-- Prioridad opcional en los issues, con el mismo enum de las features. null = "Sin prioridad",
-- así los issues existentes no hay que clasificarlos al migrar. Aditiva.

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "priority" "Priority";
