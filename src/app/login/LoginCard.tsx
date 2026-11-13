"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { GithubIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { GITHUB_NOT_INVITED_ERROR } from "@/lib/invitations";

type TestLogin = {
  users: readonly { role: string; label: string; email: string }[];
  password: string;
};

export function LoginCard({ testLogin }: { testLogin: TestLogin | null }) {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Better Auth propaga los fallos del callback como ?error=... Sin leerlo, un
  // login rechazado es indistinguible de un botón que no hizo nada.
  const error = searchParams.get("error");

  async function handleGithub() {
    setPending(true);
    // Sin errorCallbackURL Better Auth manda los errores del callback a su propia
    // página (/api/auth/error), y en producción a "/?error=...", que se pierde al
    // redirigir. Así vuelven acá con ?error, incluido github_not_invited.
    await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/login" });
  }

  async function handleTestUser(email: string) {
    if (!testLogin) return;
    setPending(true);
    setTestError(null);
    const { error: signInError } = await authClient.signIn.email({ email, password: testLogin.password });
    if (signInError) {
      setPending(false);
      setTestError(
        "No se pudo entrar. ¿Corriste `pnpm dev:test-users` contra la rama dev después del último reset?",
      );
      return;
    }
    // Si se llegó aquí desde la autorización de un cliente MCP, /login trae su query
    // (client_id, redirect_uri…). Con GitHub el navegador sigue el redirect a /autorizar;
    // este login va por fetch, así que se retoma la autorización con la sesión ya creada.
    window.location.assign(
      searchParams.has("client_id") ? `/api/auth/mcp/authorize?${searchParams.toString()}` : "/dashboard",
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="logo-wordmark">
          C<em>L</em>IC
        </div>
        <div className="logo-tagline">Plataforma interna</div>
      </div>

      <h1 className="auth-title">Ingresar</h1>
      <p className="auth-lead">Usa tu cuenta de GitHub para entrar a proyectos, calendario y StandUps.</p>

      {error === GITHUB_NOT_INVITED_ERROR ? (
        <div className="auth-error">
          Tu cuenta de GitHub no está invitada. Pídele a coordinación que agregue tu usuario de GitHub y vuelve a
          intentarlo.
        </div>
      ) : (
        error && (
          <div className="auth-error">
            No pudimos iniciar tu sesión. Si tu correo de GitHub es privado, revisa que la aplicación tenga permiso para
            leerlo, o inténtalo de nuevo.
          </div>
        )
      )}

      <button className="btn-primary auth-btn" onClick={handleGithub} disabled={pending}>
        <GithubIcon />
        {pending ? "Redirigiendo…" : "Continuar con GitHub"}
      </button>

      <p className="auth-note">
        Para entrar por primera vez, coordinación tiene que haber agregado tu usuario de GitHub a las invitaciones.
      </p>

      {testLogin && (
        <div className="mt-5 border-t border-border pt-4 text-left">
          <p className="text-xs text-text-2">Usuarios de prueba · solo en desarrollo</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {testLogin.users.map((user) => (
              <button
                key={user.role}
                type="button"
                className="btn-ghost justify-center"
                onClick={() => handleTestUser(user.email)}
                disabled={pending}
              >
                {user.label}
              </button>
            ))}
          </div>
          {testError && <p className="mt-2 text-xs text-danger">{testError}</p>}
        </div>
      )}
    </div>
  );
}
