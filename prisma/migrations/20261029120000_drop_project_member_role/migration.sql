-- El rol de cada persona dentro de un proyecto se quita: era texto libre que solo se mostraba y
-- nadie mantenía. El equipo queda como una lista de personas. Se pierden los valores guardados.

-- AlterTable
ALTER TABLE "ProjectMember" DROP COLUMN "role";
