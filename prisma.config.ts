import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/seed.ts",
  },
  datasource: {
    // El CLI (migrate, db push, studio) usa la conexión directa/no pooleada;
    // el runtime de la app usa la pooleada por separado, vía el adapter en src/lib/prisma.ts.
    url: process.env["DATABASE_URL_UNPOOLED"],
  },
});
