-- Historial de versiones de documentos y actas. Cada versión pertenece a exactamente uno
-- de los dos; Prisma no modela CHECK, así que se agrega a mano.

-- CreateTable
CREATE TABLE "DocVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "actaId" TEXT,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocVersion_one_parent" CHECK (num_nonnulls("documentId", "actaId") = 1)
);

-- CreateIndex
CREATE INDEX "DocVersion_documentId_updatedAt_idx" ON "DocVersion"("documentId", "updatedAt");

-- CreateIndex
CREATE INDEX "DocVersion_actaId_updatedAt_idx" ON "DocVersion"("actaId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DocVersion" ADD CONSTRAINT "DocVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocVersion" ADD CONSTRAINT "DocVersion_actaId_fkey" FOREIGN KEY ("actaId") REFERENCES "Acta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocVersion" ADD CONSTRAINT "DocVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lo que ya tenía contenido arranca con una versión inicial, para que el primer cambio
-- tenga contra qué compararse. Un documento la atribuye a quien lo creó, con la fecha de
-- creación. Un acta no guarda autor ni fecha de edición: queda sin autor y con la fecha
-- de la reunión. Los ids no son cuid, pero solo tienen que ser únicos.
INSERT INTO "DocVersion" ("id", "documentId", "authorId", "content", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "authorId", "content", COALESCE("date", CURRENT_TIMESTAMP), COALESCE("date", CURRENT_TIMESTAMP)
FROM "Document"
WHERE "filled" AND "content" IS NOT NULL AND btrim("content") <> '';

INSERT INTO "DocVersion" ("id", "actaId", "content", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "content", "date", "date"
FROM "Acta"
WHERE "content" IS NOT NULL AND btrim("content") <> '';
