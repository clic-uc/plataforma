import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { auth } from "@/lib/auth";

/** Metadata del servidor OAuth (RFC 8414) para los clientes MCP. Los endpoints viven en /api/auth/mcp/*. */
export const GET = oAuthDiscoveryMetadata(auth);
export const OPTIONS = metadataCorsOptionsRequestHandler();
