-- Registro cerrado con una lista de usuarios de GitHub: Invitation guarda el usuario
-- (en minúsculas, así el unique no distingue mayúsculas), el rol con que nace la
-- cuenta y cuándo se usó. Member.githubLogin guarda el usuario con que se creó cada
-- cuenta desde ahora; las existentes quedan en null. Aditiva.

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "githubLogin" TEXT;

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invitation_githubLogin_lowercase_check" CHECK ("githubLogin" = lower("githubLogin"))
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_githubLogin_key" ON "Invitation"("githubLogin");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
