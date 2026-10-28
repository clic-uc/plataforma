-- El área de miembros y proyectos se quita: el dato era texto libre sin uso más allá de mostrarlo
-- y filtrar. Se pierden los valores ya guardados.

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "area";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "area";
