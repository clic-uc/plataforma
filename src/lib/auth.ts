import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { mcp } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  // Explícito aunque Better Auth lo lea solo de BETTER_AUTH_URL: el plugin mcp usa
  // options.baseURL como issuer del servidor OAuth y sin él publica metadata vacía.
  baseURL: process.env.BETTER_AUTH_URL,
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
  // Servidor OAuth del MCP (src/app/api/mcp). Los clientes se registran solos y la
  // persona entra con GitHub en /login, como siempre.
  plugins: [
    mcp({
      loginPage: "/login",
      oidcConfig: { loginPage: "/login", consentPage: "/autorizar", requirePKCE: true },
    }),
  ],
  hooks: {
    // El plugin solo pide consentimiento si el cliente manda prompt=consent, y los
    // clientes MCP no lo mandan. Como cualquiera puede registrar un cliente, se
    // fuerza: sin esto, abrir un link de autorización conectaría la cuenta sin aviso.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/mcp/authorize") return;
      return { context: { query: { ...ctx.query, prompt: "consent" } } };
    }),
  },
});
