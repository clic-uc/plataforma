"use client";

import { useState } from "react";

interface Props {
  /** null si la solicitud no trae código o el cliente no existe. */
  consentCode: string | null;
  clientName: string;
  redirectHosts: string[];
  email: string;
  /** false para Rookies: el MCP no está disponible para ellos y solo pueden cancelar. */
  allowed: boolean;
}

export function ConsentCard({ consentCode, clientName, redirectHosts, email, allowed }: Props) {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState(false);

  async function respond(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    setError(false);

    // La respuesta trae la URL del cliente, con el código si se aceptó o con
    // error=access_denied si no; en ambos casos hay que volver a él.
    const res = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept, consent_code: consentCode }),
    });
    const body: unknown = res.ok ? await res.json().catch(() => null) : null;
    const redirectURI =
      typeof body === "object" && body !== null && "redirectURI" in body ? body.redirectURI : null;

    if (typeof redirectURI !== "string") {
      setError(true);
      setPending(null);
      return;
    }
    window.location.href = redirectURI;
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="logo-wordmark">
          C<em>L</em>IC
        </div>
        <div className="logo-tagline">PLATAFORMA INTERNA</div>
      </div>

      {!consentCode ? (
        <>
          <h1 className="auth-title">Solicitud inválida</h1>
          <p className="auth-lead">
            Este enlace de autorización está incompleto o venció. Vuelve a conectar la aplicación desde tu cliente.
          </p>
        </>
      ) : (
        <>
          <h1 className="auth-title">Conectar {clientName}</h1>

          {allowed ? (
            <p className="auth-lead">
              {clientName} quiere acceder a la plataforma como <strong>{email}</strong>. Podrá ver proyectos, tareas,
              calendario y miembros, y en tu nombre registrar horas, enviar tu StandUp, crear y editar tareas, crear
              eventos y editar documentos.
            </p>
          ) : (
            <p className="auth-lead">El acceso a la plataforma por MCP no está disponible para Rookies.</p>
          )}

          {error && <div className="auth-error">No pudimos completar la autorización. Inténtalo de nuevo.</div>}

          {allowed && (
            <button className="btn-primary auth-btn" onClick={() => respond(true)} disabled={pending !== null}>
              {pending === "accept" ? "Conectando…" : "Permitir"}
            </button>
          )}
          <button className="btn-ghost auth-btn" onClick={() => respond(false)} disabled={pending !== null}>
            {pending === "deny" ? "Cancelando…" : "Cancelar"}
          </button>

          {redirectHosts.length > 0 && (
            <p className="auth-note">
              Al permitir, el acceso se entrega a: <strong>{redirectHosts.join(", ")}</strong>. Autoriza solo
              aplicaciones que estés conectando tú.
            </p>
          )}
        </>
      )}
    </div>
  );
}
