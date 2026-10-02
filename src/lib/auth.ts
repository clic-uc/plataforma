import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: false },
  // Better Auth escribe sobre Member; no hay modelo User propio. Los campos de
  // dominio tienen @default en el schema, así que el INSERT de la librería
  // produce una fila válida y no se necesitan databaseHooks.
  user: { modelName: "member" },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      // scope por defecto: "read:user user:email". user:email es obligatorio para
      // resolver el correo vía /user/emails cuando el perfil lo tiene en privado.
      mapProfileToUser: (profile) => ({
        // profile.name es null si el usuario no lo definió; profile.login siempre
        // está presente y Member.name es NOT NULL.
        name: profile.name ?? profile.login,
      }),
    },
  },
});
