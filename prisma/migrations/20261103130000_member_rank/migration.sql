-- Rango (estrellas) como columna propia: una autoevaluación de 1 a 5 que edita
-- cada persona. Antes se derivaba del nivel (min(4, level)); se copia lo que se
-- veía, subido a 1 para quien no tenía estrellas. Aditiva.

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;

UPDATE "Member" SET "rank" = GREATEST(1, LEAST(5, "level"));

ALTER TABLE "Member" ADD CONSTRAINT "Member_rank_check" CHECK ("rank" BETWEEN 1 AND 5);
