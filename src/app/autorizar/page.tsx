import { redirect } from "next/navigation";
import { ConsentCard } from "@/app/autorizar/ConsentCard";
import { getOAuthClient } from "@/lib/api/oauth.server";
import { getCurrentMember } from "@/lib/auth/guards";

type Props = { searchParams: Promise<{ consent_code?: string; client_id?: string }> };

/**
 * Consentimiento OAuth del MCP. Better Auth redirige aquí después de /api/auth/mcp/authorize
 * (src/lib/auth.ts fuerza que siempre pase) con el código pendiente y el cliente.
 */
export default async function AutorizarPage({ searchParams }: Props) {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (!member.isVerified) redirect("/pendiente");

  const { consent_code: consentCode, client_id: clientId } = await searchParams;
  const client = clientId ? await getOAuthClient(clientId) : null;

  return (
    <main className="auth-shell">
      <ConsentCard
        consentCode={consentCode && client ? consentCode : null}
        clientName={client?.name || "Una aplicación sin nombre"}
        redirectHosts={client?.redirectHosts ?? []}
        email={member.email}
        allowed={member.role !== "ROOKIE"}
      />
    </main>
  );
}
