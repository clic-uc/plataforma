import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

/**
 * Metadata de recurso protegido (RFC 9728) del MCP. Los clientes la piden primero con
 * la ruta del recurso como sufijo (/.well-known/oauth-protected-resource/api/mcp) y
 * después sin ella; el resource se deriva de esa ruta. El servidor de autorización es
 * Better Auth, cuyo issuer es BETTER_AUTH_URL.
 */
const handler = protectedResourceHandler({ authServerUrls: [process.env.BETTER_AUTH_URL as string] });

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
