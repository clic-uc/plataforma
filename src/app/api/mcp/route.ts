import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@/lib/auth";
import { AuthError, requireMcpAccess, runAsMember } from "@/lib/auth/guards";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/server";

/**
 * Servidor MCP de la plataforma (Streamable HTTP sin estado).
 *
 * Autentica con los tokens OAuth que emite el plugin mcp de Better Auth, no con la
 * cookie de sesión. Las tools llaman a las mismas funciones .server.ts que la API,
 * así que heredan sus reglas y permisos: runAsMember hace que los guards vean al
 * dueño del token como si fuera la sesión.
 */
const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: { name: "clic", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

async function verifyToken(request: Request): Promise<AuthInfo | undefined> {
  const token = await auth.api.getMcpSession({ headers: request.headers });
  if (!token?.userId) return undefined;
  return {
    token: token.accessToken,
    clientId: token.clientId,
    scopes: token.scopes.split(" "),
    expiresAt: Math.floor(new Date(token.accessTokenExpiresAt).getTime() / 1000),
    extra: { memberId: token.userId },
  };
}

async function handler(request: Request): Promise<Response> {
  const memberId = request.auth?.extra?.memberId as string;

  return runAsMember(memberId, async () => {
    // Una cuenta pendiente o Rookie puede tener token (lo obtuvo al entrar con
    // GitHub), pero no usarlo: se rechaza aquí y no en cada tool.
    try {
      await requireMcpAccess();
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json(
          { jsonrpc: "2.0", error: { code: -32001, message: error.message }, id: null },
          { status: error.status },
        );
      }
      throw error;
    }
    return mcpHandler(request);
  });
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
