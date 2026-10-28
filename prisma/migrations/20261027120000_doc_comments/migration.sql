-- Comentarios sobre un fragmento de un documento o de un acta. Cada comentario pertenece a
-- exactamente uno de los dos; Prisma no modela CHECK, así que se agrega a mano.

-- CreateTable
CREATE TABLE "DocComment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "actaId" TEXT,
    "authorId" TEXT,
    "quote" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocComment_one_parent" CHECK (num_nonnulls("documentId", "actaId") = 1)
);

-- CreateIndex
CREATE INDEX "DocComment_documentId_createdAt_idx" ON "DocComment"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocComment_actaId_createdAt_idx" ON "DocComment"("actaId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocComment" ADD CONSTRAINT "DocComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocComment" ADD CONSTRAINT "DocComment_actaId_fkey" FOREIGN KEY ("actaId") REFERENCES "Acta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocComment" ADD CONSTRAINT "DocComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
