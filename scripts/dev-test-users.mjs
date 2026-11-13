// Crea (o deja al día) los usuarios de prueba y el proyecto Test en la rama dev de Neon.
// Idempotente: correrlo después de cada "Reset from parent", que copia production y borra
// lo que hubiera en dev.
//
//   pnpm dev:test-users
//
// Lee .env.local y se niega a correr si NEON_BRANCH no es "dev". Para entrar con ellos,
// `ENABLE_TEST_LOGIN=1` en .env.local (ver src/lib/auth/test-login.ts, que repite la lista
// de usuarios y la contraseña por defecto: mantener los dos en sintonía).

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

const USERS = [
  { id: "test-user-rookie", role: "ROOKIE", name: "Prueba Rookie", email: "rookie@test.clic.local" },
  { id: "test-user-equipo", role: "EQUIPO", name: "Prueba Equipo", email: "equipo@test.clic.local" },
  { id: "test-user-coordinacion", role: "COORDINACION", name: "Prueba Coordinación", email: "coordinacion@test.clic.local" },
];
const PASSWORD = process.env.TEST_USERS_PASSWORD || "clic-dev-pass";
const PROJECT_ID = "test-project-dev";
const SLOTS = ["KICKOFF", "REQUERIMIENTOS", "TECNICO", "DECISIONES", "INFORME"];

if (process.env.NEON_BRANCH !== "dev") {
  console.error(`NEON_BRANCH es "${process.env.NEON_BRANCH ?? ""}", no "dev". Este script solo corre contra la rama dev.`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const passwordHash = await hashPassword(PASSWORD);

for (const user of USERS) {
  // Por email: si alguien ya creó la cuenta a mano, se reutiliza su id.
  const [member] = await sql`
    INSERT INTO "Member" (id, name, email, "emailVerified", role, "isVerifiedByCoordinator", "updatedAt")
    VALUES (${user.id}, ${user.name}, ${user.email}, true, ${user.role}::"MemberRole", true, now())
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      status = 'ACTIVO',
      "isVerifiedByCoordinator" = true,
      "updatedAt" = now()
    RETURNING id`;

  const [account] = await sql`
    SELECT id FROM "Account" WHERE "userId" = ${member.id} AND "providerId" = 'credential'`;
  if (account) {
    await sql`UPDATE "Account" SET password = ${passwordHash}, "updatedAt" = now() WHERE id = ${account.id}`;
  } else {
    await sql`
      INSERT INTO "Account" (id, "accountId", "providerId", "userId", password, "updatedAt")
      VALUES (${randomUUID()}, ${member.id}, 'credential', ${member.id}, ${passwordHash}, now())`;
  }
  user.memberId = member.id;
}

await sql`
  INSERT INTO "Project" (id, name, client, description, status, "startDate", archived)
  VALUES (${PROJECT_ID}, 'Test', 'CLIC', 'Proyecto de prueba que solo existe en la rama dev de Neon.',
          'DESARROLLO', date_trunc('day', now() AT TIME ZONE 'UTC'), false)
  ON CONFLICT (id) DO NOTHING`;
for (const slot of SLOTS) {
  await sql`
    INSERT INTO "Document" (id, "projectId", slot, filled)
    VALUES (${randomUUID()}, ${PROJECT_ID}, ${slot}::"DocSlotType", false)
    ON CONFLICT ("projectId", slot) DO NOTHING`;
}
// Equipo y Coordinación en el equipo del proyecto (se les pueden asignar tareas); el Rookie
// no, para probar lo que ve alguien de fuera.
for (const user of USERS.filter((u) => u.role !== "ROOKIE")) {
  await sql`
    INSERT INTO "ProjectMember" ("projectId", "memberId") VALUES (${PROJECT_ID}, ${user.memberId})
    ON CONFLICT DO NOTHING`;
}

console.log("Listo en la rama dev:");
for (const user of USERS) console.log(`  ${user.role.padEnd(13)} ${user.email}`);
console.log(`  Contraseña: ${process.env.TEST_USERS_PASSWORD ? "la de TEST_USERS_PASSWORD" : PASSWORD}`);
console.log(`  Proyecto: Test (${PROJECT_ID})`);
