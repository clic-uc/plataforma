import "server-only";

import { prisma } from "@/lib/prisma";

export interface OAuthClientSummary {
  /** Lo declara el propio cliente al registrarse: cualquiera puede llamarse "Claude". */
  name: string | null;
  /** Hosts a los que el cliente puede volver tras autorizar; eso sí identifica quién recibe el acceso. */
  redirectHosts: string[];
}

/** Datos de un cliente OAuth del MCP para la pantalla de consentimiento, o null si no existe. */
export async function getOAuthClient(clientId: string): Promise<OAuthClientSummary | null> {
  const app = await prisma.oauthApplication.findUnique({
    where: { clientId },
    select: { name: true, redirectUrls: true },
  });
  if (!app) return null;

  const hosts = app.redirectUrls.split(",").flatMap((url) => {
    try {
      return [new URL(url).host];
    } catch {
      return [];
    }
  });
  return { name: app.name, redirectHosts: [...new Set(hosts)] };
}
