-- Issues de un proyecto y su hilo de comentarios. El estado y su motivo de cierre van
-- juntos (CHECK): un issue cerrado tiene motivo y fecha, uno abierto no. Prisma no modela
-- CHECK, así que se agrega a mano.

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('BUG', 'IDEA', 'PREGUNTA');

-- CreateEnum
CREATE TYPE "IssueCloseReason" AS ENUM ('RESUELTO', 'DESCARTADO', 'DUPLICADO');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'ABIERTO',
    "closeReason" "IssueCloseReason",
    "authorId" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Issue_closed_consistent" CHECK (
        ("status" = 'CERRADO') = ("closeReason" IS NOT NULL AND "closedAt" IS NOT NULL)
        AND ("closeReason" IS NULL) = ("closedAt" IS NULL)
    ),
    CONSTRAINT "Issue_number_positive" CHECK ("number" > 0)
);

-- CreateTable
CREATE TABLE "IssueComment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_projectId_status_lastActivityAt_idx" ON "Issue"("projectId", "status", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_projectId_number_key" ON "Issue"("projectId", "number");

-- CreateIndex
CREATE INDEX "IssueComment_issueId_createdAt_idx" ON "IssueComment"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

