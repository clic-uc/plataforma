-- Cada guardado crea su propia versión y ninguna se modifica después, así que updatedAt
-- deja de tener sentido. Las versiones que alcanzaron a fusionarse con la regla de sesión
-- anterior conservan su contenido final con la fecha de creación.

-- DropIndex
DROP INDEX "DocVersion_actaId_updatedAt_idx";

-- DropIndex
DROP INDEX "DocVersion_documentId_updatedAt_idx";

-- AlterTable
ALTER TABLE "DocVersion" DROP COLUMN "updatedAt";

-- CreateIndex
CREATE INDEX "DocVersion_documentId_createdAt_idx" ON "DocVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocVersion_actaId_createdAt_idx" ON "DocVersion"("actaId", "createdAt");
