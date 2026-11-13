import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { mcp } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { admitInvitedUser, markInvitationUsed } from "@/lib/auth/invitations";
import { isTestLoginEnabled } from "@/lib/auth/test-login";

export const auth = betterAuth({
  // Explícito aunque Better Auth lo lea solo de BETTER_AUTH_URL: el plugin mcp usa
  // options.baseURL como issuer del servidor OAuth y sin él publica metadata vacía.
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Solo para los usuarios de prueba de la rama dev (src/lib/auth/test-login.ts); nunca en
  // Vercel. Sin registro: las cuentas las crea scripts/dev-test-users.mjs.
  emailAndPassword: { enabled: isTestLoginEnabled(), disableSignUp: true },
  // Better Auth escribe sobre Member; no hay modelo User propio. Los campos de
  // dominio tienen @default en el schema, así que el INSERT de la librería
  // produce una fila válida aunque no los conozca.
  user: {
    modelName: "member",
    // El adapter solo inserta los campos que conoce, así que van declarados los
    // que pone el hook de alta (src/lib/auth/invitations.ts).
    additionalFields: {
      // Tiene que admitir input: con input: false Better Auth descarta lo que
      // devuelve mapProfileToUser. Que nadie lo cambie por /update-user lo impide
      // el hook before de más abajo.
      githubLogin: { type: "string", required: false },
      // input: false: solo los escribe el hook, nunca un request.
      role: { type: "string", required: false, input: false },
      isVerifiedByCoordinator: { type: "boolean", required: false, input: false },
      joinedAt: { type: "date", required: false, input: false },
    },
  },
  // Registro cerrado: solo entra por primera vez quien tiene una invitación (su
  // usuario de GitHub en la tabla Invitation, que coordinación administra en
  // /miembros). Sin ella no se crea el Member y el callback vuelve a /login con
  // ?error=github_not_invited. Solo corre al crear: las cuentas existentes no pasan
  // por acá.
  databaseHooks: {
    user: {
      create: {
        before: (user) => admitInvitedUser(user),
        after: (user) => markInvitationUsed(user),
      },
    },
  },
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
        // Lo que busca el hook de alta en las invitaciones. Sin
        // overrideUserInfoOnSignIn solo se escribe al crear la cuenta.
        githubLogin: profile.login,
      }),
    },
  },
  // Servidor OAuth del MCP (src/app/api/mcp). Los clientes se registran solos y la
  // persona entra con GitHub en /login, como siempre.
  plugins: [
    mcp({
      loginPage: "/login",
      oidcConfig: {
        loginPage: "/login",
        consentPage: "/autorizar",
        requirePKCE: true,
        // Los clientes MCP no piden scope, y con el default ("openid") el plugin no
        // entrega refresh token: había que volver a autenticar cada hora.
        defaultScope: "openid offline_access",
      },
    }),
  ],
  hooks: {
    // El plugin solo pide consentimiento si el cliente manda prompt=consent, y los
    // clientes MCP no lo mandan. Como cualquiera puede registrar un cliente, se
    // fuerza: sin esto, abrir un link de autorización conectaría la cuenta sin aviso.
    before: createAuthMiddleware(async (ctx) => {
      // githubLogin acepta input (ver user.additionalFields) y /update-user lo
      // escribiría. La app no usa ese endpoint, pero está expuesto.
      if (ctx.path === "/update-user" && ctx.body && typeof ctx.body === "object" && "githubLogin" in ctx.body) {
        throw new APIError("BAD_REQUEST", { message: "githubLogin no se puede cambiar" });
      }
      if (ctx.path !== "/mcp/authorize") return;
      return { context: { query: { ...ctx.query, prompt: "consent" } } };
    }),
  },
});
