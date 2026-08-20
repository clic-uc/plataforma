"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { GithubIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

export function LoginCard() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // Better Auth propaga los fallos del callback como ?error=... Sin leerlo, un
  // login rechazado es indistinguible de un botón que no hizo nada.
  const error = searchParams.get("error");

  async function handleGithub() {
    setPending(true);
    await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="logo-wordmark">
          C<em>L</em>IC
        </div>
        <div className="logo-tagline">PLATAFORMA INTERNA</div>
      </div>

      <p className="auth-lead">Ingresa con tu cuenta de GitHub para continuar.</p>

      {error && (
        <div className="auth-error">
          No pudimos iniciar tu sesión. Si tu correo de GitHub es privado, revisa que la aplicación tenga permiso para
          leerlo, o inténtalo de nuevo.
        </div>
      )}

      <button className="btn-primary auth-btn" onClick={handleGithub} disabled={pending}>
        <GithubIcon />
        {pending ? "Redirigiendo…" : "Continuar con GitHub"}
      </button>

      <p className="auth-note">
        Si es tu primera vez, tu cuenta quedará a la espera de que coordinación la apruebe.
      </p>
    </div>
  );
}
